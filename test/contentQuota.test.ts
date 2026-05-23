import assert from 'node:assert';
import {
	ContentMimeType,
	ContentStorageType,
	ContentView,
	CorePermissionName,
	UserContentActionName,
	UserLimitName
} from '../app/modules/database/interface.js';
import {IGeesomeApp} from '../app/interface.js';

describe('content quota', function () {
	this.timeout(60000);

	let app: IGeesomeApp;
	let admin;
	let testUser;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7791});
		await app.flushDatabase();
		admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then(r => r.user);
		testUser = await app.registerUser({
			email: 'quota-user@user.com',
			name: 'quota-user',
			password: 'user',
			permissions: [CorePermissionName.UserAll]
		});
	});

	afterEach(async () => {
		await app.stop();
	});

	function getContentData(storageId) {
		return {
			userId: testUser.id,
			name: `${storageId}.txt`,
			storageId,
			storageType: ContentStorageType.IPFS,
			mimeType: ContentMimeType.Text,
			view: ContentView.Contents,
			size: 4
		};
	}

	function getUploadActionData() {
		return {
			name: UserContentActionName.Upload,
			userId: testUser.id,
			size: 4
		};
	}

	it('serializes content and upload action commits against the active size limit', async () => {
		await app.setUserLimit(admin.id, {
			name: UserLimitName.SaveContentSize,
			value: 5,
			adminId: admin.id,
			userId: testUser.id,
			periodTimestamp: 60,
			isActive: true
		});

		const results = await Promise.allSettled([
			app.ms.database.addContentWithUserContentAction(getContentData('quota-a'), getUploadActionData(), UserLimitName.SaveContentSize),
			app.ms.database.addContentWithUserContentAction(getContentData('quota-b'), getUploadActionData(), UserLimitName.SaveContentSize)
		]);
		const fulfilled = results.filter(result => result.status === 'fulfilled');
		const rejected = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
		const Content = app.ms.database.sequelize.model('content') as any;
		const UserContentAction = app.ms.database.sequelize.model('userContentAction') as any;

		assert.equal(fulfilled.length, 1);
		assert.equal(rejected.length, 1);
		assert.equal(rejected[0].reason.message, 'limit_reached');
		assert.equal(await Content.count({where: {userId: testUser.id}}), 1);
		assert.equal(await UserContentAction.count({where: {userId: testUser.id, name: UserContentActionName.Upload}}), 1);
		assert.equal(await app.getUserLimitRemained(testUser.id, UserLimitName.SaveContentSize), 1);
	});

	it('keeps handled save limit failures out of stderr', async () => {
		await app.setUserLimit(admin.id, {
			name: UserLimitName.SaveContentSize,
			value: 5,
			adminId: admin.id,
			userId: testUser.id,
			periodTimestamp: 60,
			isActive: true
		});

		const originalConsoleError = console.error;
		const consoleErrorCalls = [];
		let thrownError;

		console.error = ((...args) => {
			consoleErrorCalls.push(args);
		}) as any;

		try {
			await app.ms.content.saveData(testUser.id, Buffer.from('exceeds-limit'), 'too-large.txt');
		} catch (e) {
			thrownError = e;
		} finally {
			console.error = originalConsoleError;
		}

		assert.equal(String(thrownError?.message || thrownError), 'limit_reached');
		assert.deepEqual(consoleErrorCalls, []);
	});
});
