import assert from "assert";
import {Op} from "sequelize";
import {getModule as getSocNetAccountModule} from "../app/modules/socNetAccount/index.js";
import {IGeesomeApp} from "../app/interface.js";

describe("social network accounts unit", function () {
	it("creates new provider accounts without replacing a different user account", async () => {
		const socNetAccounts = createSocNetAccountModule([{
			id: 1,
			userId: 1,
			socNet: "telegram",
			accountId: "telegram-account",
			username: "telegram-user",
			apiKey: "telegram-secret"
		}]);

		const blueskyAccount = await socNetAccounts.createOrUpdateAccount(1, {
			socNet: "bluesky",
			accountId: "did:plc:alice",
			username: "alice.bsky.social",
			apiKey: "bluesky-secret"
		});

		assert.equal(socNetAccounts.rows.length, 2);
		assert.equal(socNetAccounts.rows[0].socNet, "telegram");
		assert.equal(socNetAccounts.rows[0].apiKey, "telegram-secret");
		assert.equal(blueskyAccount.id, 2);
		assert.equal(blueskyAccount.socNet, "bluesky");
		assert.equal(blueskyAccount.accountId, "did:plc:alice");

		const updatedBlueskyAccount = await socNetAccounts.createOrUpdateAccount(1, {
			socNet: "bluesky",
			accountId: "did:plc:alice",
			username: "alice.handle.changed",
			apiKey: "new-bluesky-secret"
		});

		assert.equal(socNetAccounts.rows.length, 2);
		assert.equal(updatedBlueskyAccount.id, blueskyAccount.id);
		assert.equal(socNetAccounts.rows[1].username, "alice.handle.changed");
		assert.equal(socNetAccounts.rows[1].apiKey, "new-bluesky-secret");
	});

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

class FakeSocNetAccount {
	id = 0;
	[key: string]: any;

	constructor(data: any) {
		Object.assign(this, data);
	}

	async update(data: any) {
		Object.assign(this, data);
		return this;
	}
}

function createSocNetAccountModule(accounts: any[] = []) {
	const rows = accounts.map((account) => new FakeSocNetAccount(account));
	let nextId = Math.max(0, ...rows.map((account) => account.id || 0)) + 1;
	const module = getSocNetAccountModule({
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
			findOne: async ({where = {}} = {}) => {
				return rows.find(account => matchesSocNetAccountWhere(account, where)) || null;
			},
			findAll: async ({where = {}, order = [], limit, offset = 0} = {}) => {
				const result = rows.filter(account => matchesSocNetAccountWhere(account, where));
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
			},
			create: async (data) => {
				const row = new FakeSocNetAccount({
					...data,
					id: data.id || nextId
				});
				nextId = Math.max(nextId + 1, row.id + 1);
				rows.push(row);
				return row;
			}
		}
	}) as any;
	module.rows = rows;
	return module;
}

function matchesSocNetAccountWhere(account: FakeSocNetAccount, where: any): boolean {
	return Reflect.ownKeys(where).every((key: any) => {
		if (key === Op.or) {
			return where[key].some((condition) => matchesSocNetAccountWhere(account, condition));
		}
		return account[key] === where[key];
	});
}
