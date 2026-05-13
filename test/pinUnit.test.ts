import assert from "assert";
import axios from "axios";
import {getModule as getPinModule} from "../app/modules/pin/index.js";
import {IGeesomeApp} from "../app/interface.js";

function createPinModule(accounts: any[] = [], contentByStorageId: Record<string, any> = {}, editableGroupIds: number[] = [1]) {
	return getPinModule({
		encryptTextWithAppPass: async (text) => `encrypted:${text}`,
		decryptTextWithAppPass: async (text) => text.replace(/^encrypted:/, ""),
		ms: {
			content: {
				getContentByStorageAndUserId: async (storageId, userId) => {
					const content = contentByStorageId[storageId];
					return content && content.userId === userId ? content : null;
				}
			},
			storage: {
				remoteNodeAddressList: async () => ["node-address"]
			},
			database: {
				setDefaultListParamsValues: (listParams, defaults = {}) => {
					listParams.sortBy = listParams.sortBy || defaults.sortBy || "createdAt";
					listParams.sortDir = listParams.sortDir || defaults.sortDir || "DESC";
					listParams.limit = typeof listParams.limit === "number" ? listParams.limit : defaults.limit || 20;
					listParams.offset = typeof listParams.offset === "number" ? listParams.offset : defaults.offset || 0;
				}
			},
			group: {
				canEditGroup: async (userId, groupId) => editableGroupIds.includes(Number(groupId))
			}
		}
	} as unknown as IGeesomeApp, {
		PinAccount: {
			create: async (account) => {
				const created = {
					id: accounts.length + 1,
					...account
				};
				accounts.push(created);
				return created;
			},
			findOne: async ({where}) => accounts.find((account) => {
				return Object.keys(where).every((key) => account[key] === where[key]);
			}) || null,
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
			},
			update: async (updateData, {where}) => {
				const account = accounts.find((item) => {
					return Object.keys(where).every((key) => item[key] === where[key]);
				});
				if (account) {
					Object.assign(account, updateData);
				}
				return [account ? 1 : 0];
			},
			destroy: async ({where}) => {
				const index = accounts.findIndex((item) => {
					return Object.keys(where).every((key) => item[key] === where[key]);
				});
				if (index === -1) {
					return 0;
				}
				accounts.splice(index, 1);
				return 1;
			}
		}
	});
}

describe("pin negative paths", function () {
	let originalAxiosPost;

	beforeEach(() => {
		originalAxiosPost = axios.post;
	});

	afterEach(() => {
		axios.post = originalAxiosPost;
	});

	it("fails explicitly when a user pin account is missing", async () => {
		const pins = createPinModule();

		await assert.rejects(
			() => pins.pinByUserAccount(1, "missing", "storage-id"),
			(error: Error) => error.message === "pin_account_not_found"
		);
	});

	it("fails explicitly for unknown pin services", async () => {
		const pins = createPinModule([{userId: 1, name: "custom", service: "custom"}]);

		await assert.rejects(
			() => pins.pinByUserAccount(1, "custom", "storage-id"),
			(error: Error) => error.message === "unknown_service"
		);
	});

	it("fails before remote pinning when content is not owned by the account user", async () => {
		const pins = createPinModule([{userId: 1, name: "pinata", service: "pinata"}]);

		await assert.rejects(
			() => pins.pinByUserAccount(1, "pinata", "missing-storage"),
			(error: Error) => error.message === "content_not_found"
		);
	});

	it("fails explicitly when updating a missing pin account", async () => {
		const pins = createPinModule();

		await assert.rejects(
			() => pins.updateAccount(1, 404, {apiKey: "updated"}),
			(error: Error) => error.message === "pin_account_not_found"
		);
	});

	it("allows group pin account creation only for editable groups", async () => {
		const accounts = [];
		const pins = createPinModule(accounts, {}, [10]);

		const created = await pins.createAccount(1, {
			name: "group-pinata",
			service: "pinata",
			groupId: 10,
			apiKey: "pinata-key",
			secretApiKey: "pinata-secret",
			isEncrypted: true
		});

		assert.equal(created.userId, 1);
		assert.equal(created.groupId, 10);
		assert.equal(created.secretApiKey, "");
		assert.equal(created.secretApiKeyEncrypted, "encrypted:pinata-secret");

		await assert.rejects(
			() => pins.createAccount(1, {
				name: "other-group-pinata",
				service: "pinata",
				groupId: 20,
				apiKey: "pinata-key"
			}),
			(error: Error) => error.message === "not_permitted"
		);
		assert.equal(accounts.length, 1);
	});

	it("deletes pin accounts only when the user can manage them", async () => {
		const accounts = [
			{id: 1, userId: 1, name: "user-pinata", service: "pinata"},
			{id: 2, userId: 2, groupId: 10, name: "group-pinata", service: "pinata"},
			{id: 3, userId: 2, groupId: 20, name: "other-group-pinata", service: "pinata"}
		];
		const pins = createPinModule(accounts, {}, [10]);

		assert.deepEqual(await pins.deleteAccount(1, 1), {success: true});
		assert.deepEqual(await pins.deleteAccount(1, 2), {success: true});
		assert.equal(accounts.some(account => account.id === 1), false);
		assert.equal(accounts.some(account => account.id === 2), false);
		assert.equal(accounts.some(account => account.id === 3), true);

		await assert.rejects(
			() => pins.deleteAccount(1, 3),
			(error: Error) => error.message === "not_permitted"
		);
		await assert.rejects(
			() => pins.deleteAccount(1, 404),
			(error: Error) => error.message === "pin_account_not_found"
		);
	});

	it("encrypts secret keys on pin account updates", async () => {
		const account = {
			id: 1,
			userId: 1,
			name: "pinata",
			service: "pinata",
			apiKey: "old-key",
			secretApiKey: "",
			secretApiKeyEncrypted: "encrypted:old-secret",
			isEncrypted: true
		};
		const pins = createPinModule([account]);

		const updated = await pins.updateAccount(1, 1, {
			apiKey: "new-key",
			secretApiKey: "new-secret",
			isEncrypted: true
		});

		assert.equal(account.apiKey, "new-key");
		assert.equal(account.secretApiKey, "new-secret");
		assert.equal(account.secretApiKeyEncrypted, "encrypted:new-secret");
		assert.equal(updated.secretApiKey, "new-secret");
	});

	it("forwards pin options to Pinata metadata", async () => {
		let pinataRequest;
		axios.post = async (url, body, config) => {
			pinataRequest = {url, body, config};
			return {data: {ok: true}};
		};
		const pins = createPinModule(
			[{
				userId: 1,
				name: "pinata",
				service: "pinata",
				apiKey: "pinata-key",
				secretApiKey: "pinata-secret"
			}],
			{"storage-id": {userId: 1, name: "content-name"}}
		);

		await pins.pinByUserAccount(1, "pinata", "storage-id", {source: "auto-action"});

		assert.deepEqual(pinataRequest.body, {
			hostNodes: ["node-address"],
			hashToPin: "storage-id",
			pinataMetadata: {
				name: "content-name",
				keyvalues: {source: "auto-action"}
			}
		});
		assert.equal(pinataRequest.config.headers.pinata_api_key, "pinata-key");
		assert.equal(pinataRequest.config.headers.pinata_secret_api_key, "pinata-secret");
	});

	it("caps and orders pin account lists", async () => {
		const accounts = Array.from({length: 105}, (_, index) => {
			const suffix = String(105 - index).padStart(3, "0");
			return {
				id: index + 1,
				userId: 1,
				name: `pin-${suffix}`,
				service: "pinata"
			};
		});
		accounts.push({
			id: 106,
			userId: 2,
			name: "pin-000",
			service: "pinata"
		});
		const pins = createPinModule(accounts);

		const gotAccounts = await pins.getUserAccountsList(1, {
			limit: 1000,
			sortBy: "name",
			sortDir: "ASC"
		});

		assert.equal(gotAccounts.length, 100);
		assert.equal(gotAccounts[0].name, "pin-001");
		assert.equal(gotAccounts[99].name, "pin-100");
	});

	it("normalizes remote Pinata request failures", async () => {
		axios.post = async () => {
			const error = new Error("request failed") as Error & {response?: any};
			error.response = {status: 503, data: {error: "temporarily unavailable"}};
			throw error;
		};
		const pins = createPinModule(
			[{userId: 1, name: "pinata", service: "pinata"}],
			{"storage-id": {userId: 1, name: "content-name"}}
		);

		await assert.rejects(
			() => pins.pinByUserAccount(1, "pinata", "storage-id"),
			(error: Error & {status?: number, details?: any}) => {
				assert.equal(error.message, "pinata_pin_failed");
				assert.equal(error.status, 503);
				assert.deepEqual(error.details, {error: "temporarily unavailable"});
				return true;
			}
		);
	});
});
