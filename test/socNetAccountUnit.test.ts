import assert from "assert";
import {getModule as getSocNetAccountModule} from "../app/modules/socNetAccount/index.js";
import {IGeesomeApp} from "../app/interface.js";

function createSocNetAccountModule(accounts: any[] = []) {
	return getSocNetAccountModule({
		ms: {
			database: {
				setDefaultListParamsValues: (listParams, defaults = {}) => {
					listParams.sortBy = listParams.sortBy || defaults.sortBy || "createdAt";
					listParams.sortDir = listParams.sortDir || defaults.sortDir || "DESC";
					listParams.limit = typeof listParams.limit === "number" ? listParams.limit : defaults.limit || 20;
					listParams.offset = typeof listParams.offset === "number" ? listParams.offset : defaults.offset || 0;
				}
			}
		}
	} as unknown as IGeesomeApp, {
		Account: {
			findAll: async ({where = {}, order = [], limit, offset = 0} = {}) => {
				const result = accounts.filter((account) => {
					return Object.keys(where).every((key) => account[key] === where[key]);
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
		}
	});
}

describe("social network accounts unit", function () {
	it("caps user account lists and keeps socNet filtering", async () => {
		const accounts = Array.from({length: 105}, (_, index) => {
			const suffix = String(105 - index).padStart(3, "0");
			return {
				id: index + 1,
				userId: 1,
				socNet: "telegram",
				username: `telegram-${suffix}`,
				phoneNumber: `+1000${suffix}`
			};
		});
		accounts.push({
			id: 106,
			userId: 1,
			socNet: "twitter",
			username: "twitter-001",
			phoneNumber: "+2000001"
		});
		accounts.push({
			id: 107,
			userId: 2,
			socNet: "telegram",
			username: "telegram-other-user",
			phoneNumber: "+3000001"
		});
		const socNetAccounts = createSocNetAccountModule(accounts);

		const listedAccounts = await socNetAccounts.getAccountList(1, "telegram", {
			limit: 1000,
			sortBy: "username",
			sortDir: "ASC"
		});

		assert.equal(listedAccounts.length, 100);
		assert.equal(listedAccounts[0].username, "telegram-001");
		assert.equal(listedAccounts[99].username, "telegram-100");
		assert.equal(listedAccounts.some((account) => account.socNet !== "telegram"), false);
		assert.equal(listedAccounts.some((account) => account.userId !== 1), false);
	});
});
