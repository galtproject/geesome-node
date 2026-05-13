import assert from "assert";
import {getModule as getForeignAccountsModule} from "../app/modules/foreignAccounts/index.js";
import {IGeesomeApp} from "../app/interface.js";

function createForeignAccountsModule(accounts: any[] = []) {
	return getForeignAccountsModule({
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
		ForeignAccount: {
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

describe("foreign accounts unit", function () {
	it("caps API-style account lists but preserves full manifest exports", async () => {
		const accounts = Array.from({length: 105}, (_, index) => {
			const suffix = String(105 - index).padStart(3, "0");
			return {
				id: index + 1,
				userId: 1,
				provider: `provider-${suffix}`,
				address: `0x${suffix}`,
				signature: `sig-${suffix}`
			};
		});
		accounts.push({
			id: 106,
			userId: 2,
			provider: "provider-000",
			address: "0x000",
			signature: "sig-000"
		});
		const foreignAccounts = createForeignAccountsModule(accounts);

		const listedAccounts = await foreignAccounts.getUserAccountsList(1, {
			limit: 1000,
			sortBy: "provider",
			sortDir: "ASC"
		});

		assert.equal(listedAccounts.length, 100);
		assert.equal(listedAccounts[0].provider, "provider-001");
		assert.equal(listedAccounts[99].provider, "provider-100");

		const manifestData: any = {};
		await (foreignAccounts as any).beforeEntityManifestStore(1, "user", {}, manifestData);
		assert.equal(manifestData.foreignAccounts.length, 105);
		assert.deepEqual(manifestData.foreignAccounts[0], {
			provider: "provider-105",
			address: "0x105",
			signature: "sig-105"
		});
	});
});
