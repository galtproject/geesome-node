import assert from "assert";
import registerTgContentBotApi from "../app/modules/tgContentBot/api.js";

function createTgContentBotApiHarness(contentBots: any[]) {
    const routes = {};
    const app = {
        ms: {
            api: {
                prefix: (prefix) => ({
                    onAuthorizedPost: (path, handler) => {
                        routes[`POST ${prefix}${path}`] = handler;
                    },
                    onPost: (path, handler) => {
                        routes[`POST ${prefix}${path}`] = handler;
                    }
                })
            },
            database: {
                setDefaultListParamsValues: (listParams, defaults = {}) => {
                    listParams.sortBy = listParams.sortBy || defaults.sortBy || "createdAt";
                    listParams.sortDir = listParams.sortDir || defaults.sortDir || "DESC";
                    listParams.limit = typeof listParams.limit === "number" ? listParams.limit : defaults.limit || 20;
                    listParams.offset = typeof listParams.offset === "number" ? listParams.offset : defaults.offset || 0;
                }
            }
        },
        encryptTextWithAppPass: async (value) => value
    };
    const models = {
        ContentBots: {
            create: async (bot) => bot,
            findAll: async ({where = {}, order = [], limit, offset = 0} = {}) => {
                const result = contentBots.filter((bot) => {
                    return Object.keys(where).every((key) => bot[key] === where[key]);
                });
                result.sort((left, right) => {
                    for (const [field, direction] of order) {
                        if (left[field] === right[field]) {
                            continue;
                        }
                        const value = left[field] > right[field] ? 1 : -1;
                        return direction === "DESC" ? -value : value;
                    }
                    return 0;
                });
                const start = offset || 0;
                const end = typeof limit === "number" ? start + limit : undefined;
                return result.slice(start, end);
            }
        },
        User: {
            create: async (user) => user
        }
    };

    registerTgContentBotApi(app as any, models, {triger: () => {}} as any);

    return {
        async call(method, path, req = {}) {
            let responseBody;
            await routes[`${method} ${path}`]({
                user: {id: 1},
                body: {},
                headers: {host: "localhost"},
                params: {},
                query: {},
                ...req
            }, {
                send: (body) => {
                    responseBody = body;
                }
            });
            return responseBody;
        }
    };
}

describe("telegram content bot api", function () {
    it("caps current-user bot lists and applies allowlisted ordering", async () => {
        const bots = Array.from({length: 105}, (_, index) => {
            const suffix = String(105 - index).padStart(3, "0");
            return {
                id: index + 1,
                userId: 1,
                botUsername: `bot-${suffix}`,
                socNet: "telegram"
            };
        });
        bots.push({
            id: 106,
            userId: 2,
            botUsername: "bot-000",
            socNet: "telegram"
        });
        const {call} = createTgContentBotApiHarness(bots);

        const listedBots = await call("POST", "content-bot/list", {
            body: {
                limit: "1000",
                sortBy: "botUsername",
                sortDir: "ASC"
            }
        });

        assert.equal(listedBots.length, 100);
        assert.equal(listedBots[0].botUsername, "bot-001");
        assert.equal(listedBots[99].botUsername, "bot-100");
        assert.equal(listedBots.some((bot) => bot.userId !== 1), false);
    });
});
