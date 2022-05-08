/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../app/interface";
import {
	CorePermissionName,
} from "../app/modules/database/interface";
import IGeesomeStaticSiteManagerModule from "../app/modules/staticSiteGenerator/interface";

const {getTitleAndDescription} = require('../app/modules/staticSiteGenerator/helpers');

const assert = require('assert');

describe("staticSiteGenerator", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let app: IGeesomeApp, staticSiteGenerator: IGeesomeStaticSiteManagerModule;

	beforeEach(async () => {
		const appConfig = require('../app/config');
		appConfig.storageConfig.implementation = 'js-ipfs';
		appConfig.storageConfig.jsNode.repo = '.jsipfs-test';
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
		appConfig.storageConfig.jsNode.config = {
			Addresses: {
				Swarm: [
					"/ip4/0.0.0.0/tcp/40002",
					"/ip4/127.0.0.1/tcp/40003/ws",
					"/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star"
				]
			}
		};

		try {
			app = await require('../app')({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
			const testUser = await app.registerUser({
				email: 'user@user.com',
				name: 'user',
				password: 'user',
				permissions: [CorePermissionName.UserAll]
			});
			await app.ms.group.createGroup(testUser.id, {
				name: 'test',
				title: 'Test'
			});
			staticSiteGenerator = app.ms['staticSiteGenerator'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.ms.database.flushDatabase();
		await app.stop();
	});

	it('webpage message should import properly', async () => {
		const text = 'Кто плюсист?<br><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br><br><i>Language<br>concepts[6], with terse syntax.[7]<br>modules[8]<br><br>Library<br>ranges (The One Ranges Proposal)[35]</i>';
		const {title, description} = getTitleAndDescription([{view: 'contents', text}], {
			titleLength: 200,
			descriptionLength: 200
		})
		console.log('title', title, 'description', description);
		assert.equal(title, 'Кто плюсист?<br/><a href="https://en.wikipedia.org/wiki/C%2B%2B20">https://en.wikipedia.org/wiki/C%2B%2B20</a><br/><br/><i>Language<br/>concepts[6], with terse syntax.[7]<br/>modules[8]<br/><br/>Library<br/>r...</i>');
	});
});