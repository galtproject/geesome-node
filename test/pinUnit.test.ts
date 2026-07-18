import assert from "assert";
import axios from "axios";
import {Op} from "sequelize";
import {getModule as getPinModule} from "../app/modules/pin/index.js";
import {IGeesomeApp} from "../app/interface.js";
import {PinStorageObjectStatus} from "../app/modules/pin/stateHelpers.js";

function createPinModule(
	accounts: any[] = [],
	contentByStorageId: Record<string, any> = {},
	editableGroupIds: number[] | ((userId: number, groupId: number) => boolean) = [1],
	markedStorageObjects: any[] = [],
	pinnedStorageObjects: any[] = [],
	autoActions: any[] = [],
	postsById: Record<number, any> = {},
	moduleOptions: any = {}
) {
	return getPinModule({
		encryptTextWithAppPass: async (text) => `encrypted:${text}`,
		decryptTextWithAppPass: async (text) => text.replace(/^encrypted:/, ""),
		ms: {
			autoActions: {
				addAutoAction: async (userId, action) => {
					const created = {id: autoActions.length + 1, userId, ...action};
					autoActions.push(created);
					return created;
				},
				deactivateUniqueAutoActionsByIdentityPrefix: async (userId, identityPrefix) => {
					const deactivations = (autoActions as any).deactivations || [];
					deactivations.push({userId, identityPrefix});
					(autoActions as any).deactivations = deactivations;
					return 1;
				}
			},
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
				updateContent: async (id, updateData) => {
					const content = Object.values(contentByStorageId).find((item: any) => item.id === id);
					if (content) {
						Object.assign(content, updateData);
					}
				},
				markStorageObjectPinnedByContent: async (content) => {
					markedStorageObjects.push(content);
					content.storageObjectPinned = true;
				},
				setDefaultListParamsValues: (listParams, defaults = {}) => {
					listParams.sortBy = listParams.sortBy || defaults.sortBy || "createdAt";
					listParams.sortDir = listParams.sortDir || defaults.sortDir || "DESC";
					listParams.limit = typeof listParams.limit === "number" ? listParams.limit : defaults.limit || 20;
					listParams.offset = typeof listParams.offset === "number" ? listParams.offset : defaults.offset || 0;
				}
			},
			group: {
				canEditGroup: async (userId, groupId) => typeof editableGroupIds === 'function'
					? editableGroupIds(Number(userId), Number(groupId))
					: editableGroupIds.includes(Number(groupId)),
				getPostPure: async (postId) => postsById[postId] || null
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
			findOne: async ({where}) => accounts.find(account => matchesWhere(account, where)) || null,
			findAll: async ({where = {}, order = [], limit, offset = 0} = {}) => {
				const result = accounts.filter(account => matchesWhere(account, where));
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
				const account = accounts.find(item => matchesWhere(item, where));
				if (account) {
					Object.assign(account, updateData);
				}
				return [account ? 1 : 0];
			},
			destroy: async ({where}) => {
				const index = accounts.findIndex(item => matchesWhere(item, where));
				if (index === -1) {
					return 0;
				}
				accounts.splice(index, 1);
				return 1;
			}
		},
		PinStorageObject: {
			findOne: async ({where}) => pinnedStorageObjects.find(item => matchesWhere(item, where)) || null,
			findAll: async ({where}) => pinnedStorageObjects.filter(item => matchesWhere(item, where)),
			findOrCreate: async ({where, defaults}) => {
				const existing = pinnedStorageObjects.find((item) => {
					return Object.keys(where).every((key) => item[key] === where[key]);
				});
				if (existing) {
					return [existing, false];
				}
				const created = createPinnedStorageObjectRecord({
					id: pinnedStorageObjects.length + 1,
					...defaults
				});
				pinnedStorageObjects.push(created);
				return [created, true];
			},
			update: async (updateData, {where}) => {
				const rows = pinnedStorageObjects.filter(item => matchesWhere(item, where));
				rows.forEach(item => Object.assign(item, updateData));
				return [rows.length];
			}
		}
	}, moduleOptions);
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
		assert.deepEqual(
			await pins.pinByAccountId(1, 404, "storage-id", {source: "auto-pin"}),
			{skipped: true, reason: "auto_pin_account_missing"}
		);
	});

	it("skips obsolete automatic pin policies before provider access", async () => {
		let providerCalls = 0;
		axios.post = async () => {
			providerCalls += 1;
			return {data: {ok: true}};
		};
		const content = {id: 1, userId: 1, storageId: "storage-id", name: "content"};
		const account = {
			id: 1,
			userId: 1,
			name: "automatic",
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: false}})
		};
		const pins = createPinModule([account], {"storage-id": content});

		assert.deepEqual(
			await pins.pinByAccountId(1, 1, "storage-id", {source: "auto-pin"}),
			{skipped: true, reason: "auto_pin_policy_disabled"}
		);
		assert.deepEqual(
			await pins.pinByUserAccount(1, "automatic", "storage-id", {source: "auto-pin"}),
			{skipped: true, reason: "auto_pin_policy_disabled"}
		);
		account.options = JSON.stringify({autoPin: {enabled: true}});
		assert.deepEqual(
			await pins.pinByAccountId(2, 1, "storage-id", {source: "auto-pin"}),
			{skipped: true, reason: "auto_pin_account_scope_changed"}
		);
		assert.equal(providerCalls, 0);
	});

	it("skips removed group targets and preserves group policy across admin changes", async () => {
		let providerCalls = 0;
		axios.post = async () => {
			providerCalls += 1;
			return {data: {ok: true}};
		};
		const account = {
			id: 1,
			userId: 1,
			groupId: 10,
			name: "group-automatic",
			service: "pinata",
			options: JSON.stringify({
				autoPin: {enabled: true, scope: "group-post", targets: ["contents"]}
			})
		};
		const post = {
			id: 5,
			groupId: 10,
			status: "published",
			isDeleted: false,
			group: {isPublic: true, isRemote: false, isEncrypted: false},
			manifestStorageId: "manifest-id",
			contents: []
		};
		const pins = createPinModule([account], {}, [10], [], [], [], {5: post});

		assert.deepEqual(
			await pins.pinByAccountId(1, 1, "manifest-id", {
				source: "group-post-auto-pin",
				postId: 5,
				target: "post-manifest"
			}),
			{skipped: true, reason: "auto_pin_target_removed"}
		);
		assert.deepEqual(
			await pins.pinByGroupAccount(1, 10, "group-automatic", "manifest-id", {
				source: "group-post-auto-pin",
				postId: 5,
				target: "post-manifest"
			}),
			{skipped: true, reason: "auto_pin_target_removed"}
		);
		const noPermissionPins = createPinModule([account], {}, [], [], [], [], {5: post});
		assert.deepEqual(
			await noPermissionPins.pinByAccountId(1, 1, "manifest-id", {
				source: "group-post-auto-pin",
				postId: 5,
				target: "contents"
			}),
			{ok: true}
		);
		assert.equal(providerCalls, 1);
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
			{"storage-id": {id: 10, userId: 1, name: "content-name"}}
		);

		const response = await pins.pinByUserAccount(1, "pinata", "storage-id", {source: "auto-action"});

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
		assert.equal(pinataRequest.config.timeout, 30000);
		assert.equal(pinataRequest.config.maxRedirects, 0);
		assert.ok(pinataRequest.config.signal instanceof AbortSignal);
		assert.deepEqual(response, {ok: true});
	});

	it("aborts active provider requests when the module stops", async () => {
		axios.post = async (_url, _body, config) => new Promise((_resolve, reject) => {
			config.signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), {code: 'ERR_CANCELED'})));
		});
		const pins: any = createPinModule(
			[{userId: 1, name: "pinata", service: "pinata"}],
			{"storage-id": {userId: 1, name: "content-name"}}
		);
		const request = pins.pinByUserAccount(1, "pinata", "storage-id");
		await new Promise(resolve => setImmediate(resolve));
		await pins.stop();

		await assert.rejects(request, (error: any) => {
			assert.equal(error.message, 'pinata_pin_failed');
			assert.equal(error.retryable, true);
			return true;
		});
	});

	it("rejects unapproved custom endpoints before sending account credentials", async () => {
		let providerCalls = 0;
		const pinnedStorageObjects = [];
		axios.post = async () => {
			providerCalls += 1;
			return {data: {ok: true}};
		};
		const pins = createPinModule(
			[{
				id: 1,
				userId: 1,
				name: "custom-pinata",
				service: "pinata",
				endpoint: "https://unapproved.example.test/pin",
				apiKey: "pinata-key",
				secretApiKey: "pinata-secret"
			}],
			{"storage-id": {userId: 1, name: "content-name"}},
			[1],
			[],
			pinnedStorageObjects
		);

		await assert.rejects(
			() => pins.pinByUserAccount(1, "custom-pinata", "storage-id"),
			(error: any) => error.message === 'pin_provider_custom_endpoint_disabled' && error.retryable === false
		);
		assert.equal(providerCalls, 0);
		assert.equal(pinnedStorageObjects.length, 1);
		assert.equal(pinnedStorageObjects[0].status, PinStorageObjectStatus.TerminalFailure);
		assert.equal(pinnedStorageObjects[0].lastErrorCode, 'pin_provider_custom_endpoint_disabled');
		assert.equal(pinnedStorageObjects[0].nextCheckAt, null);
	});

	it("queues one-shot auto pin actions only for opted-in user accounts", async () => {
		const autoActions = [];
		const pins: any = createPinModule([
			{
				id: 1,
				userId: 1,
				name: "automatic",
				service: "pinata",
				options: JSON.stringify({
					autoPin: {enabled: true, attempts: 20, metadata: {collection: "uploads"}}
				})
			},
			{userId: 1, name: "manual", service: "pinata"},
			{
				userId: 1,
				groupId: 10,
				name: "group-automatic",
				service: "pinata",
				options: {autoPin: {enabled: true}}
			}
		], {}, [10], [], [], autoActions);

		await pins.afterContentAdding(1, {storageId: "storage-id"});

		assert.equal(autoActions.length, 1);
		assert.equal(autoActions[0].moduleName, "pin");
		assert.equal(autoActions[0].funcName, "pinByAccountId");
		assert.deepEqual(JSON.parse(autoActions[0].funcArgs), [
			1,
			"storage-id",
			{source: "auto-pin", collection: "uploads"}
		]);
		assert.equal(autoActions[0].isActive, true);
		assert.equal(autoActions[0].executePeriod, 0);
		assert.equal(autoActions[0].totalExecuteAttempts, 10);
		assert.equal(autoActions[0].currentExecuteAttempts, 10);
		assert(autoActions[0].executeOn instanceof Date);
	});

	it("requires an explicit target policy for group automatic pinning", async () => {
		const pins = createPinModule([], {}, [10]);

		await assert.rejects(
			() => pins.createAccount(1, {
				name: "ambiguous-group-auto-pin",
				service: "pinata",
				groupId: 10,
				options: {autoPin: {enabled: true}}
			}),
			(error: Error) => error.message === "group_auto_pin_policy_invalid"
		);

		const account = await pins.createAccount(1, {
			name: "group-auto-pin",
			service: "pinata",
			groupId: 10,
			options: {
				autoPin: {
					enabled: true,
					scope: "group-post",
					targets: ["post-manifest", "contents"]
				}
			}
		});

		assert.equal(account.groupId, 10);
		await assert.rejects(
			() => pins.updateAccount(1, account.id, {groupId: 11}),
			(error: Error) => error.message === "pin_account_scope_immutable"
		);
	});

	it("queues group post targets under the account owner and skips pinned targets", async () => {
		const autoActions = [];
		const pinnedStorageObjects = [{pinAccountId: 7, storageId: "already-pinned", status: "pinned"}];
		const post = {
			id: 55,
			groupId: 10,
			userId: 2,
			status: "published",
			isDeleted: false,
			isRemote: false,
			manifestStorageId: "post-manifest",
			group: {id: 10, isPublic: true, isRemote: false, isEncrypted: false},
			contents: [
				{id: 101, userId: 2, storageId: "other-user-content"},
				{id: 102, userId: 2, storageId: "already-pinned"}
			]
		};
		const pins: any = createPinModule([{
			id: 7,
			userId: 1,
			groupId: 10,
			name: "group-auto-pin",
			service: "pinata",
			options: JSON.stringify({
				autoPin: {
					enabled: true,
					scope: "group-post",
					targets: ["post-manifest", "contents"],
					attempts: 4
				}
			})
		}], {}, [10], [], pinnedStorageObjects, autoActions, {55: post});

		await pins.afterPostManifestUpdate(2, 55);

		assert.equal(autoActions.length, 2);
		assert(autoActions.every(action => action.userId === 1));
		assert(autoActions.every(action => action.funcName === "pinByAccountId"));
		assert.deepEqual(autoActions.map(action => JSON.parse(action.funcArgs)[1]), [
			"post-manifest",
			"other-user-content"
		]);
		assert(autoActions.every(action => action.totalExecuteAttempts === 4));

		post.group.isPublic = false;
		await pins.afterPostManifestUpdate(2, 55);
		post.group.isPublic = true;
		post.isRemote = true;
		await pins.afterPostManifestUpdate(2, 55);
		assert.equal(autoActions.length, 2);
	});

	it("pins another user's content only through an eligible group post", async () => {
		let pinataRequest;
		axios.post = async (url, body) => {
			pinataRequest = {url, body};
			return {data: {IpfsHash: body.hashToPin}};
		};
		const content: any = {id: 101, userId: 2, storageId: "other-user-content", name: "shared.jpg"};
		const pinnedStorageObjects = [];
		const post = {
			id: 55,
			groupId: 10,
			status: "published",
			isDeleted: false,
			isRemote: false,
			group: {id: 10, isPublic: true, isRemote: false, isEncrypted: false},
			contents: [content]
		};
		const pins = createPinModule([{
			id: 7,
			userId: 1,
			groupId: 10,
			name: "group-pinata",
			service: "pinata"
		}], {"other-user-content": content}, [10], [], pinnedStorageObjects, [], {55: post});

		await pins.pinByGroupAccount(1, 10, "group-pinata", "other-user-content", {postId: 55});

		assert.equal(pinataRequest.body.hashToPin, "other-user-content");
		assert.equal(content.isPinned, undefined);
		assert.equal(pinnedStorageObjects[0].status, "accepted");
		post.group.isPublic = false;
		await assert.rejects(
			() => pins.pinByGroupAccount(1, 10, "group-pinata", "other-user-content", {postId: 55}),
			(error: Error) => error.message === "group_post_pin_not_permitted"
		);
	});

	it("stores structured pin account options as JSON", async () => {
		const accounts = [];
		const pins = createPinModule(accounts);

		await pins.createAccount(1, {
			name: "automatic",
			service: "pinata",
			options: {autoPin: {enabled: true}}
		});

		assert.equal(accounts[0].options, JSON.stringify({autoPin: {enabled: true}}));
	});

	it("invalidates cached auto pin policy when an account is updated", async () => {
		const accounts: any[] = [{
			id: 1,
			userId: 1,
			name: "automatic",
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: false}})
		}];
		const autoActions = [];
		const pins: any = createPinModule(accounts, {}, [1], [], [], autoActions);

		await pins.afterContentAdding(1, {storageId: "first-storage"});
		await pins.updateAccount(1, 1, {options: {autoPin: {enabled: true}}});
		await pins.afterContentAdding(1, {storageId: "second-storage"});

		assert.equal(autoActions.length, 1);
		assert.equal(JSON.parse(autoActions[0].funcArgs)[1], "second-storage");
	});

	it("deactivates pending automatic pins when policy is disabled or the account is deleted", async () => {
		const accounts: any[] = [{
			id: 1,
			userId: 1,
			name: "automatic",
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: true}})
		}];
		const autoActions = [];
		const pins: any = createPinModule(accounts, {}, [1], [], [], autoActions);

		await pins.updateAccount(1, 1, {options: {autoPin: {enabled: false}}});
		assert.deepEqual((autoActions as any).deactivations, [{
			userId: 1,
			identityPrefix: "pin:pin:1:"
		}]);

		await pins.deleteAccount(1, 1);
		assert.deepEqual((autoActions as any).deactivations, [
			{userId: 1, identityPrefix: "pin:pin:1:"},
			{userId: 1, identityPrefix: "pin:pin:1:"}
		]);
	});

	it("refreshes auto pin policy changes made by another module after the bounded ttl", async () => {
		const accounts: any[] = [{
			id: 1,
			userId: 1,
			name: "automatic",
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: false}})
		}];
		const autoActions = [];
		let now = 0;
		const moduleOptions = {
			autoPinPolicyCacheTtlMs: 100,
			now: () => now
		};
		const firstPins: any = createPinModule(
			accounts, {}, [1], [], [], autoActions, {}, moduleOptions
		);
		const secondPins: any = createPinModule(
			accounts, {}, [1], [], [], [], {}, moduleOptions
		);

		await firstPins.afterContentAdding(1, {storageId: "initial-disabled"});
		await secondPins.updateAccount(1, 1, {options: {autoPin: {enabled: true}}});
		await firstPins.afterContentAdding(1, {storageId: "update-before-expiry"});
		assert.equal(autoActions.length, 0);

		now = 100;
		await firstPins.afterContentAdding(1, {storageId: "update-after-expiry"});
		assert.equal(autoActions.length, 1);

		await secondPins.deleteAccount(1, 1);
		await firstPins.afterContentAdding(1, {storageId: "delete-before-expiry"});
		assert.equal(autoActions.length, 2);

		now = 200;
		await firstPins.afterContentAdding(1, {storageId: "delete-after-expiry"});
		assert.equal(autoActions.length, 2);

		await secondPins.createAccount(1, {
			name: "replacement",
			service: "pinata",
			options: {autoPin: {enabled: true}}
		});
		await firstPins.afterContentAdding(1, {storageId: "create-before-expiry"});
		assert.equal(autoActions.length, 2);

		now = 300;
		await firstPins.afterContentAdding(1, {storageId: "create-after-expiry"});
		assert.equal(autoActions.length, 3);
	});

	it("records provider acceptance without claiming confirmation", async () => {
		axios.post = async () => {
			return {data: {IpfsHash: "storage-id", ok: true}};
		};
		const content: any = {id: 12, userId: 1, storageId: "storage-id", name: "content-name", isPinned: false};
		const markedStorageObjects: any[] = [];
		const pinnedStorageObjects: any[] = [];
		const pins = createPinModule(
			[{
				id: 4,
				userId: 1,
				name: "pinata",
				service: "pinata",
				apiKey: "pinata-key",
				secretApiKey: "pinata-secret"
			}],
			{"storage-id": content},
			[1],
			markedStorageObjects,
			pinnedStorageObjects
		);

		await pins.pinByUserAccount(1, "pinata", "storage-id");

		assert.equal(content.isPinned, false);
		assert.equal(content.storageObjectPinned, undefined);
		assert.deepEqual(markedStorageObjects, []);
		assert.equal(pinnedStorageObjects.length, 1);
		assert.equal(pinnedStorageObjects[0].storageId, "storage-id");
		assert.equal(pinnedStorageObjects[0].pinAccountId, 4);
		assert.equal(pinnedStorageObjects[0].accountName, "pinata");
		assert.equal(pinnedStorageObjects[0].service, "pinata");
		assert.equal(pinnedStorageObjects[0].status, "accepted");
		assert.equal(pinnedStorageObjects[0].attemptCount, 1);
		assert.equal(!!pinnedStorageObjects[0].requestedAt, true);
		assert.equal(!!pinnedStorageObjects[0].acceptedAt, true);
		assert.equal(!!pinnedStorageObjects[0].attemptId, true);
		assert.equal(pinnedStorageObjects[0].resultJson.includes("pinata-secret"), false);
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

	it("keeps direct and group account authorization separate across admin changes", async () => {
		const accounts: any[] = [{
			id: 1,
			userId: 1,
			groupId: 10,
			name: "group-pinata",
			service: "pinata",
			apiKey: "key",
			secretApiKey: "secret"
		}];
		const canEditGroup = (userId, groupId) => userId === 2 && groupId === 10;
		const pinnedStorageObjects = [{pinAccountId: 1, storageId: "historical-storage", status: "pinned"}];
		const pins = createPinModule(accounts, {}, canEditGroup, [], pinnedStorageObjects);

		assert.equal(await pins.getUserAccount(1, "group-pinata"), null);
		assert.deepEqual(await pins.getUserAccountsList(1), []);
		await assert.rejects(
			() => pins.updateAccount(1, 1, {apiKey: "former-admin-key"}),
			(error: Error) => error.message === "not_permitted"
		);
		await assert.rejects(
			() => pins.pinByGroupAccount(1, 10, "group-pinata", "storage-id"),
			(error: Error) => error.message === "not_permitted"
		);

		const updated = await pins.updateAccount(2, 1, {apiKey: "current-admin-key"});
		assert.equal(updated.apiKey, "current-admin-key");
		assert.equal((await pins.getGroupAccountsList(2, 10))[0].id, 1);
		await assert.rejects(
			() => pins.updateAccount(2, 1, {groupId: null}),
			(error: Error) => error.message === "pin_account_scope_immutable"
		);
		await pins.deleteAccount(2, 1);
		assert.equal(accounts.length, 0);
		assert.equal(pinnedStorageObjects.length, 1);
		assert.equal(pinnedStorageObjects[0].storageId, "historical-storage");
	});

	it("discovers every automatic account through cursor batches", async () => {
		const userAccounts = Array.from({length: 105}, (_, index) => ({
			id: index + 1,
			userId: 1,
			groupId: null,
			name: `user-${String(105 - index).padStart(3, "0")}`,
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: true}})
		}));
		const groupAccounts = Array.from({length: 105}, (_, index) => ({
			id: index + 106,
			userId: 2,
			groupId: 10,
			name: `group-${String(105 - index).padStart(3, "0")}`,
			service: "pinata",
			options: JSON.stringify({
				autoPin: {enabled: true, scope: "group-post", targets: ["post-manifest"]}
			})
		}));
		userAccounts.push({
			id: 211,
			userId: 1,
			groupId: null,
			name: null,
			service: "pinata",
			options: JSON.stringify({autoPin: {enabled: true}})
		});
		groupAccounts.push({
			id: 212,
			userId: 2,
			groupId: 10,
			name: null,
			service: "pinata",
			options: JSON.stringify({
				autoPin: {enabled: true, scope: "group-post", targets: ["post-manifest"]}
			})
		});
		const autoActions = [];
		const postsById = {
			7: {
				id: 7,
				groupId: 10,
				status: "published",
				isDeleted: false,
				isRemote: false,
				manifestStorageId: "manifest-id",
				contents: [],
				group: {isPublic: true, isRemote: false, isEncrypted: false}
			}
		};
		const pins = createPinModule(
			[...userAccounts, ...groupAccounts],
			{},
			[10],
			[],
			[],
			autoActions,
			postsById
		);

		await pins.afterContentAdding(1, {storageId: "content-id"});
		await pins.afterPostManifestUpdate(2, 7);

		assert.equal(autoActions.filter(action => action.userId === 1).length, 106);
		assert.equal(autoActions.filter(action => action.userId === 2).length, 106);
	});

	it("normalizes remote Pinata request failures", async () => {
		const pinnedStorageObjects = [];
		axios.post = async () => {
			const error = new Error("request failed") as Error & {response?: any};
			error.response = {status: 503, data: {error: "temporarily unavailable"}};
			throw error;
		};
		const pins = createPinModule(
			[{id: 1, userId: 1, name: "pinata", service: "pinata"}],
			{"storage-id": {userId: 1, name: "content-name"}},
			[1],
			[],
			pinnedStorageObjects
		);

		await assert.rejects(
			() => pins.pinByUserAccount(1, "pinata", "storage-id"),
			(error: Error & {status?: number, details?: any, retryable?: boolean}) => {
				assert.equal(error.message, "pinata_pin_failed");
				assert.equal(error.status, 503);
				assert.equal(error.details, '{"error":"temporarily unavailable"}');
				assert.equal(error.retryable, true);
				return true;
			}
		);
		assert.equal(pinnedStorageObjects.length, 1);
		assert.equal(pinnedStorageObjects[0].status, PinStorageObjectStatus.RetryableFailure);
		assert.equal(pinnedStorageObjects[0].attemptCount, 1);
		assert.equal(pinnedStorageObjects[0].lastErrorCode, 'pinata_pin_failed');
		assert.match(pinnedStorageObjects[0].lastErrorMessage, /temporarily unavailable/);
		assert(pinnedStorageObjects[0].nextCheckAt instanceof Date);
	});

	it("keeps the newest concurrent pin attempt state", async () => {
		const pinnedStorageObjects = [];
		const pins: any = createPinModule([], {}, [1], [], pinnedStorageObjects);
		const account = {id: 1, userId: 1, name: 'pinata', service: 'pinata'};
		const firstAttempt = await pins.beginPinStorageObjectAttempt('storage-id', account);
		const secondAttempt = await pins.beginPinStorageObjectAttempt('storage-id', account);

		await pins.finishPinStorageObjectAttempt(secondAttempt, PinStorageObjectStatus.Accepted, {
			storageId: 'storage-id',
			result: {data: {IpfsHash: 'storage-id'}}
		});
		await pins.finishPinStorageObjectAttempt(firstAttempt, PinStorageObjectStatus.TerminalFailure, {
			error: Object.assign(new Error('late failure'), {retryable: false})
		});

		assert.equal(pinnedStorageObjects[0].attemptCount, 2);
		assert.equal(pinnedStorageObjects[0].attemptId, secondAttempt.attemptId);
		assert.equal(pinnedStorageObjects[0].status, PinStorageObjectStatus.Accepted);
	});

	it("supports explicit provider reconciliation transitions", async () => {
		const pinnedStorageObjects = [createPinnedStorageObjectRecord({
			id: 1,
			pinAccountId: 2,
			storageId: 'storage-id',
			status: PinStorageObjectStatus.Accepted,
			resultJson: JSON.stringify({IpfsHash: 'storage-id'})
		})];
		const pins: any = createPinModule([], {}, [1], [], pinnedStorageObjects);

		await pins.updatePinStorageObjectStatus(2, 'storage-id', PinStorageObjectStatus.Confirmed);
		assert.equal(pinnedStorageObjects[0].status, PinStorageObjectStatus.Confirmed);
		assert(pinnedStorageObjects[0].confirmedAt instanceof Date);
		assert(pinnedStorageObjects[0].pinnedAt instanceof Date);
		assert.equal(pinnedStorageObjects[0].resultJson, JSON.stringify({IpfsHash: 'storage-id'}));

		await pins.updatePinStorageObjectStatus(2, 'storage-id', PinStorageObjectStatus.Missing);
		assert.equal(pinnedStorageObjects[0].status, PinStorageObjectStatus.Missing);
		assert.equal(pinnedStorageObjects[0].nextCheckAt, null);
		assert.equal(pinnedStorageObjects[0].resultJson, JSON.stringify({IpfsHash: 'storage-id'}));
	});
});

function createPinnedStorageObjectRecord(data) {
	const record = {
		...data,
		increment: async (field) => {
			record[field] = Number(record[field] || 0) + 1;
			return record;
		},
		update: async (updateData) => {
			Object.assign(record, updateData);
			return record;
		},
		toJSON: () => record
	};
	return record;
}

function matchesWhere(record, where) {
	return Reflect.ownKeys(where).every((key) => {
		if (key === Op.or) {
			return where[key].some(condition => matchesWhere(record, condition));
		}
		return matchesWhereValue(record[key as any], where[key]);
	});
}

function matchesWhereValue(actual, expected) {
	if (expected === null) {
		return actual === null || typeof actual === 'undefined';
	}
	if (!expected || typeof expected !== 'object') {
		return actual === expected;
	}
	return Reflect.ownKeys(expected).every((operator) => {
		if (operator === Op.ne) {
			return expected[operator] === null ? actual !== null && typeof actual !== 'undefined' : actual !== expected[operator];
		}
		if (operator === Op.gt) {
			return actual > expected[operator];
		}
		if (operator === Op.in) {
			return expected[operator].includes(actual);
		}
		return false;
	});
}
