import assert from "assert";
import {getModule as getPinModule} from "../app/modules/pin/index.js";
import {IGeesomeApp} from "../app/interface.js";

function createPinModule(accounts: any[] = [], contentByStorageId: Record<string, any> = {}) {
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
			group: {
				canEditGroup: async () => true
			}
		}
	} as unknown as IGeesomeApp, {
		PinAccount: {
			findOne: async ({where}) => accounts.find((account) => {
				return Object.keys(where).every((key) => account[key] === where[key]);
			}) || null,
			update: async (updateData, {where}) => {
				const account = accounts.find((item) => {
					return Object.keys(where).every((key) => item[key] === where[key]);
				});
				if (account) {
					Object.assign(account, updateData);
				}
				return [account ? 1 : 0];
			}
		}
	});
}

describe("pin negative paths", function () {
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
});
