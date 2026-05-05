import assert from "assert";
import {getModule as getPinModule} from "../app/modules/pin/index.js";
import {IGeesomeApp} from "../app/interface.js";

function createPinModule(accounts: any[] = [], contentByStorageId: Record<string, any> = {}) {
	return getPinModule({
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
			}) || null
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
});
