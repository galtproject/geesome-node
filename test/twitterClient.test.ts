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
	ContentView,
	CorePermissionName,
} from "../app/modules/database/interface";
import IGeesomeTwitterClient from "../app/modules/twitterClient/interface";
import {PostStatus} from "../app/modules/group/interface";
import IGeesomeSocNetImport from "../app/modules/socNetImport/interface";
import IGeesomeSocNetAccount from "../app/modules/socNetAccount/interface";

const pIteration = require('p-iteration');

const twitterHelpers = require('../app/modules/twitterClient/helpers');

const assert = require('assert');

describe("twitterClient", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, twitterClient: IGeesomeTwitterClient, socNetAccount: IGeesomeSocNetAccount,
		socNetImport: IGeesomeSocNetImport;

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
			await app.flushDatabase();

			admin = await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'}).then(r => r.user);
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
			twitterClient = app.ms['twitterClient'];
			socNetImport = app.ms['socNetImport'];
			socNetAccount = app.ms['socNetAccount'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	//
	//{"context_annotations":[{"domain":{"id":"45","name":"Brand Vertical","description":"Top level entities that describe a Brands industry"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596794716162","name":"Financial services"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}}],"author_id":"3142378517","created_at":"2020-10-16T22:57:23.000Z","possibly_sensitive":false,"lang":"en","attachments":{"media_keys":["3_1317238234095779846","3_1317238236327063553"]},"source":"Twitter for Android","entities":{"mentions":[{"start":11,"end":21,"username":"etherscan","id":"3313312856"}],"urls":[{"start":74,"end":97,"url":"https://t.co/aXSCv1889k","expanded_url":"https://twitter.com/jony_bang/status/1317238238252290048/photo/1","display_url":"pic.twitter.com/aXSCv1889k","media_key":"3_1317238234095779846"},{"start":74,"end":97,"url":"https://t.co/aXSCv1889k","expanded_url":"https://twitter.com/jony_bang/status/1317238238252290048/photo/1","display_url":"pic.twitter.com/aXSCv1889k","media_key":"3_1317238236327063553"}]},"reply_settings":"everyone","conversation_id":"1317238238252290048","text":"Seems like @etherscan looks too optimistic about gas prices in Ethereum 😅 https://t.co/aXSCv1889k","id":"1317238238252290048"}
	//{"author_id":"3142378517","created_at":"2020-08-22T10:32:09.000Z","possibly_sensitive":false,"lang":"en","source":"Twitter for Android","entities":{"mentions":[{"start":0,"end":14,"username":"unrealSatoshi","id":"1441577430091636750"}]},"referenced_tweets":[{"type":"replied_to","id":"1297041073445928960"}],"reply_settings":"everyone","in_reply_to_user_id":"846770450462072833","conversation_id":"1297041073445928960","text":"@UnrealSatoshi It's awesome, thank you! Did you participate in yesterday voting?","id":"1297119358813122565"}
	//{"entities":{"hashtags":[{"start":105,"end":114,"tag":"ethereum"},{"start":115,"end":124,"tag":"solidity"}],"mentions":[{"start":3,"end":10,"username":"mudgen","id":"6078352"},{"start":36,"end":46,"username":"jony_bang","id":"1500113611108196356"}],"urls":[{"start":81,"end":104,"url":"https://t.co/przCAVYNNe","expanded_url":"https://medium.com/coinmonks/how-to-optimize-eth-smart-contract-size-part-1-a393f444a1df","display_url":"medium.com/coinmonks/how-…"}]},"context_annotations":[{"domain":{"id":"45","name":"Brand Vertical","description":"Top level entities that describe a Brands industry"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596794716162","name":"Financial services"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}},{"domain":{"id":"65","name":"Interests and Hobbies Vertical","description":"Top level interests and hobbies groupings, like Food or Travel"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"66","name":"Interests and Hobbies Category","description":"A grouping of interests and hobbies entities, like Novelty Food or Destinations"},"entity":{"id":"847888632711061504","name":"Personal finance","description":"Personal finance"}},{"domain":{"id":"66","name":"Interests and Hobbies Category","description":"A grouping of interests and hobbies entities, like Novelty Food or Destinations"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}}],"author_id":"3142378517","created_at":"2020-08-13T12:07:50.000Z","possibly_sensitive":false,"lang":"en","source":"Twitter Web App","referenced_tweets":[{"type":"retweeted","id":"1293881636392771584"}],"reply_settings":"everyone","conversation_id":"1293881948356718594","text":"RT @mudgen: A new article series by @jony_bang on how to optimize contract size: https://t.co/przCAVYNNe #ethereum #solidity #smartcontract…","id":"1293881948356718594"}
	//{"author_id":"3142378517","created_at":"2020-02-14T17:27:15.000Z","possibly_sensitive":false,"lang":"en","attachments":{"media_keys":["3_1228370112291524609","3_1228370120042569728"]},"source":"Twitter for Android","referenced_tweets":[{"type":"replied_to","id":"1228369054949396482"}],"reply_settings":"everyone","in_reply_to_user_id":"3142378517","conversation_id":"1228369054949396482","text":"Also, there's a button that looks like menu BUT IT'S NOT. It's just a help captions, and when I'm trying to push it again - nothing happens. I think it's terrible. That button in standard menu place, and looks like menu, but It's lying to user and forces him to relearn https://t.co/8qoV79GyLi","id":"1228370130234675200","entities":{"urls":[{"start":270,"end":293,"url":"https://t.co/8qoV79GyLi","expanded_url":"https://twitter.com/jony_bang/status/1228370130234675200/photo/1","display_url":"pic.twitter.com/8qoV79GyLi","media_key":"3_1228370112291524609"},{"start":270,"end":293,"url":"https://t.co/8qoV79GyLi","expanded_url":"https://twitter.com/jony_bang/status/1228370130234675200/photo/1","display_url":"pic.twitter.com/8qoV79GyLi","media_key":"3_1228370120042569728"}]}}
	//{"entities":{"hashtags":[{"start":0,"end":7,"tag":"shitUX"}],"annotations":[{"start":11,"end":21,"probability":0.3696,"type":"Product","normalized_text":"Google maps"}],"urls":[{"start":267,"end":290,"url":"https://t.co/MNwZoHsqcY","expanded_url":"https://twitter.com/jony_bang/status/1228369054949396482/photo/1","display_url":"pic.twitter.com/MNwZoHsqcY","media_key":"3_1228369041208811520"},{"start":267,"end":290,"url":"https://t.co/MNwZoHsqcY","expanded_url":"https://twitter.com/jony_bang/status/1228369054949396482/photo/1","display_url":"pic.twitter.com/MNwZoHsqcY","media_key":"3_1228369048309768198"}]},"context_annotations":[{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596752842752","name":"Services"}},{"domain":{"id":"47","name":"Brand","description":"Brands and Companies"},"entity":{"id":"10026378521","name":"Google "}},{"domain":{"id":"48","name":"Product","description":"Products created by Brands.  Examples: Ford Explorer, Apple iPhone."},"entity":{"id":"1006154112021377024","name":"Google Maps","description":"Google Maps"}},{"domain":{"id":"67","name":"Interests and Hobbies","description":"Interests, opinions, and behaviors of individuals, groups, or cultures; like Speciality Cooking or Theme Parks"},"entity":{"id":"1037076248877395968","name":"GPS and maps","description":"GPS & Maps"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596752842752","name":"Services"}},{"domain":{"id":"47","name":"Brand","description":"Brands and Companies"},"entity":{"id":"10026378521","name":"Google "}},{"domain":{"id":"48","name":"Product","description":"Products created by Brands.  Examples: Ford Explorer, Apple iPhone."},"entity":{"id":"10043701926","name":"Google Maps"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"10026378521","name":"Google "}}],"author_id":"3142378517","created_at":"2020-02-14T17:22:59.000Z","possibly_sensitive":false,"lang":"en","attachments":{"media_keys":["3_1228369041208811520","3_1228369048309768198"]},"source":"Twitter for Android","reply_settings":"everyone","conversation_id":"1228369054949396482","text":"#shitUX in Google maps.\nThey changed buttons placement, and now - in the most convenient place you can find menu with settings, account management and so on. How many times user should press that menu button? I don't think that often. So why it placed in that place? https://t.co/MNwZoHsqcY","id":"1228369054949396482"}
	//{"context_annotations":[{"domain":{"id":"45","name":"Brand Vertical","description":"Top level entities that describe a Brands industry"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596794716162","name":"Financial services"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"847868745150119936","name":"Family & relationships","description":"Hobbies and interests"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}}],"author_id":"3142378517","created_at":"2020-01-15T11:25:24.000Z","possibly_sensitive":false,"lang":"en","source":"Twitter for Android","entities":{"mentions":[{"start":3,"end":15,"username":"galtproject","id":"1041654490523287552"}],"urls":[{"start":108,"end":131,"url":"https://t.co/1y7g8B7tMN","expanded_url":"https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6","display_url":"medium.com/galtproject/ga…","status":200,"unwound_url":"https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6"}]},"referenced_tweets":[{"type":"retweeted","id":"1217406911303372800"}],"reply_settings":"everyone","conversation_id":"1217407431157960704","text":"RT @galtproject: Hey everyone! 🎊 Amazing news! Galt•Project is live on Ethereum mainnet. More details here: https://t.co/1y7g8B7tMN.  DApp…","id":"1217407431157960704"}
	const includes = {
		"users": [{
			"username": "MicrowaveDev",
			"id": "3142378517",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1465436672942878726/FQc-4TP__normal.jpg",
			"name": "Microwave Dev"
		}, {
			"username": "sparkpool_eth",
			"id": "955345726858452992",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1143714781666217984/aUVasr8L_normal.png",
			"name": "SparkPool"
		}, {
			"username": "IliaAskey",
			"id": "846770450462072833",
			"profile_image_url": "https://pbs.twimg.com/profile_images/941128141115936768/LpKoSTDZ_normal.jpg",
			"name": "Ilia Askey"
		}, {
			"username": "galtproject",
			"id": "1041654490523287552",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1163710784377110529/LZCq11V4_normal.jpg",
			"name": "Galt Project"
		}, {
			"username": "mudgen",
			"id": "6078352",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1449724448614109189/lk5uULBG_normal.jpg",
			"name": "Nick Mudge 💎"
		}, {
			"username": "UR_LYING_MORGAN",
			"id": "783283130958569472",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1458073873937747976/7FLDP6xZ_normal.jpg",
			"name": "метатель кабанчиков"
		}, {
			"username": "vasa_develop",
			"id": "893875627916378112",
			"profile_image_url": "https://pbs.twimg.com/profile_images/935095664165339136/ZL_MUi2U_normal.jpg",
			"name": "vasa"
		}, {
			"username": "zeligenm",
			"id": "781435180800176128",
			"profile_image_url": "https://pbs.twimg.com/profile_images/1358412570881892354/8xHb-Nym_normal.jpg",
			"name": "Maria Zeligen"
		}],
		"tweets": [
			{
				"author_id": "955345726858452992",
				"created_at": "2021-05-21T08:48:45.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1395662829345132544"]},
				"source": "Twitter for iPhone",
				"referenced_tweets": [{"type": "replied_to", "id": "1395662646951641090"}],
				"reply_settings": "everyone",
				"in_reply_to_user_id": "955345726858452992",
				"conversation_id": "1395662646951641090",
				"text": "2/ ETH1 pow lauched on 2015-07-30. After about 6 years, Top5 mining pools have 64.1% share. https://t.co/NY6CGB7WtB",
				"id": "1395662836840288261",
				"entities": {
					"urls": [{
						"start": 92,
						"end": 115,
						"url": "https://t.co/NY6CGB7WtB",
						"expanded_url": "https://twitter.com/sparkpool_eth/status/1395662836840288261/photo/1",
						"display_url": "pic.twitter.com/NY6CGB7WtB",
						"media_key": "3_1395662829345132544"
					}]
				}
			},
			{
				"author_id": "846770450462072833",
				"created_at": "2020-08-22T05:21:04.000Z",
				"possibly_sensitive": false,
				"lang": "cs",
				"source": "Twitter Web App",
				"referenced_tweets": [{"type": "quoted", "id": "1296972062662234112"}],
				"reply_settings": "everyone",
				"conversation_id": "1297041073445928960",
				"text": "LOL WTF?! THat's the house I used to live in! (not first floor though), but OMFG THE WORLD IS SO SMALL!!! Поздравляю, Жека =D https://t.co/05VGyxiyK8",
				"id": "1297041073445928960",
				"entities": {
					"urls": [{
						"start": 126,
						"end": 149,
						"url": "https://t.co/05VGyxiyK8",
						"expanded_url": "https://twitter.com/MicrowaveDev/status/1296972062662234112",
						"display_url": "twitter.com/MicrowaveDev/s…"
					}]
				}
			},
			{
				"entities": {
					"hashtags": [{"start": 211, "end": 220, "tag": "Ethereum"}, {
						"start": 221,
						"end": 230,
						"tag": "proptech"
					}, {"start": 231, "end": 235, "tag": "DAO"}],
					"mentions": [{
						"start": 29,
						"end": 41,
						"username": "galtproject",
						"id": "1041654490523287552"
					}, {"start": 46, "end": 56, "username": "xdaichain", "id": "1448922864380416006"}, {
						"start": 182,
						"end": 192,
						"username": "xdaichain",
						"id": "1448922864380416006"
					}],
					"urls": [{
						"start": 236,
						"end": 259,
						"url": "https://t.co/toAO8u2UR2",
						"expanded_url": "https://twitter.com/galtproject/status/1296887930074607616/photo/1",
						"display_url": "pic.twitter.com/toAO8u2UR2",
						"media_key": "3_1296887923065917441"
					}, {
						"start": 236,
						"end": 259,
						"url": "https://t.co/toAO8u2UR2",
						"expanded_url": "https://twitter.com/galtproject/status/1296887930074607616/photo/1",
						"display_url": "pic.twitter.com/toAO8u2UR2",
						"media_key": "3_1296887923045011458"
					}]
				},
				"context_annotations": [{
					"domain": {
						"id": "45",
						"name": "Brand Vertical",
						"description": "Top level entities that describe a Brands industry"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "781974596794716162", "name": "Financial services"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}, {
					"domain": {
						"id": "65",
						"name": "Interests and Hobbies Vertical",
						"description": "Top level interests and hobbies groupings, like Food or Travel"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {
						"id": "847888632711061504",
						"name": "Personal finance",
						"description": "Personal finance"
					}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "857879456773357569", "name": "Technology", "description": "Technology"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "1001503516555337728", "name": "Blockchain", "description": "Blockchain"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}, {
					"domain": {
						"id": "65",
						"name": "Interests and Hobbies Vertical",
						"description": "Top level interests and hobbies groupings, like Food or Travel"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {
						"id": "847888632711061504",
						"name": "Personal finance",
						"description": "Personal finance"
					}
				}, {
					"domain": {
						"id": "67",
						"name": "Interests and Hobbies",
						"description": "Interests, opinions, and behaviors of individuals, groups, or cultures; like Speciality Cooking or Theme Parks"
					}, "entity": {"id": "847894737281470464", "name": "Real estate", "description": "Real estate"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					}, "entity": {"id": "847894737281470464", "name": "Real estate", "description": "Real estate"}
				}],
				"author_id": "1041654490523287552",
				"created_at": "2020-08-21T19:12:32.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1296887923065917441", "3_1296887923045011458"]},
				"source": "Twitter for iPhone",
				"reply_settings": "everyone",
				"conversation_id": "1296887930074607616",
				"text": "First HOA meeting powered by @galtproject and @xdaichain is live. \nFor the first time in history, real estate owners vote on self-government issues on a public blockchain. Thank you @xdaichain team for support! #Ethereum #proptech #DAO https://t.co/toAO8u2UR2",
				"id": "1296887930074607616"
			},
			{
				"entities": {
					"hashtags": [{"start": 93, "end": 102, "tag": "ethereum"}, {
						"start": 103,
						"end": 112,
						"tag": "solidity"
					}, {"start": 113, "end": 128, "tag": "smartcontracts"}, {
						"start": 129,
						"end": 140,
						"tag": "blockchain"
					}],
					"mentions": [{"start": 24, "end": 34, "username": "jony_bang", "id": "1500113611108196356"}],
					"urls": [{
						"start": 69,
						"end": 92,
						"url": "https://t.co/przCAVYNNe",
						"expanded_url": "https://medium.com/coinmonks/how-to-optimize-eth-smart-contract-size-part-1-a393f444a1df",
						"display_url": "medium.com/coinmonks/how-…"
					}]
				},
				"context_annotations": [{
					"domain": {
						"id": "45",
						"name": "Brand Vertical",
						"description": "Top level entities that describe a Brands industry"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "781974596794716162", "name": "Financial services"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}, {
					"domain": {
						"id": "65",
						"name": "Interests and Hobbies Vertical",
						"description": "Top level interests and hobbies groupings, like Food or Travel"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {
						"id": "847888632711061504",
						"name": "Personal finance",
						"description": "Personal finance"
					}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "857879456773357569", "name": "Technology", "description": "Technology"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "1001503516555337728", "name": "Blockchain", "description": "Blockchain"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}],
				"author_id": "6078352",
				"created_at": "2020-08-13T12:06:35.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"source": "Twitter Web App",
				"reply_settings": "everyone",
				"conversation_id": "1293881636392771584",
				"text": "A new article series by @jony_bang on how to optimize contract size: https://t.co/przCAVYNNe #ethereum #solidity #smartcontracts #blockchain",
				"id": "1293881636392771584"
			},
			{
				"entities": {
					"hashtags": [{"start": 0, "end": 7, "tag": "shitUX"}],
					"annotations": [{
						"start": 11,
						"end": 21,
						"probability": 0.3696,
						"type": "Product",
						"normalized_text": "Google maps"
					}],
					"urls": [{
						"start": 267,
						"end": 290,
						"url": "https://t.co/MNwZoHsqcY",
						"expanded_url": "https://twitter.com/jony_bang/status/1228369054949396482/photo/1",
						"display_url": "pic.twitter.com/MNwZoHsqcY",
						"media_key": "3_1228369041208811520"
					}, {
						"start": 267,
						"end": 290,
						"url": "https://t.co/MNwZoHsqcY",
						"expanded_url": "https://twitter.com/jony_bang/status/1228369054949396482/photo/1",
						"display_url": "pic.twitter.com/MNwZoHsqcY",
						"media_key": "3_1228369048309768198"
					}]
				},
				"context_annotations": [{
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "781974596752842752", "name": "Services"}
				}, {
					"domain": {"id": "47", "name": "Brand", "description": "Brands and Companies"},
					"entity": {"id": "10026378521", "name": "Google "}
				}, {
					"domain": {
						"id": "48",
						"name": "Product",
						"description": "Products created by Brands.  Examples: Ford Explorer, Apple iPhone."
					}, "entity": {"id": "1006154112021377024", "name": "Google Maps", "description": "Google Maps"}
				}, {
					"domain": {
						"id": "67",
						"name": "Interests and Hobbies",
						"description": "Interests, opinions, and behaviors of individuals, groups, or cultures; like Speciality Cooking or Theme Parks"
					}, "entity": {"id": "1037076248877395968", "name": "GPS and maps", "description": "GPS & Maps"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "781974596752842752", "name": "Services"}
				}, {
					"domain": {"id": "47", "name": "Brand", "description": "Brands and Companies"},
					"entity": {"id": "10026378521", "name": "Google "}
				}, {
					"domain": {
						"id": "48",
						"name": "Product",
						"description": "Products created by Brands.  Examples: Ford Explorer, Apple iPhone."
					}, "entity": {"id": "10043701926", "name": "Google Maps"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					}, "entity": {"id": "10026378521", "name": "Google "}
				}],
				"author_id": "3142378517",
				"created_at": "2020-02-14T17:22:59.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1228369041208811520", "3_1228369048309768198"]},
				"source": "Twitter for Android",
				"reply_settings": "everyone",
				"conversation_id": "1228369054949396482",
				"text": "#shitUX in Google maps.\nThey changed buttons placement, and now - in the most convenient place you can find menu with settings, account management and so on. How many times user should press that menu button? I don't think that often. So why it placed in that place? https://t.co/MNwZoHsqcY",
				"id": "1228369054949396482"
			},
			{
				"entities": {
					"hashtags": [{"start": 229, "end": 238, "tag": "ethereum"}, {
						"start": 239,
						"end": 243,
						"tag": "dao"
					}, {"start": 244, "end": 249, "tag": "web3"}, {"start": 250, "end": 256, "tag": "DApps"}, {
						"start": 257,
						"end": 261,
						"tag": "ETH"
					}, {"start": 262, "end": 271, "tag": "PropTech"}],
					"urls": [{
						"start": 91,
						"end": 114,
						"url": "https://t.co/1y7g8B7tMN",
						"expanded_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6",
						"display_url": "medium.com/galtproject/ga…",
						"status": 200,
						"unwound_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6"
					}, {
						"start": 131,
						"end": 154,
						"url": "https://t.co/Ey9CKYSBph",
						"expanded_url": "http://app.galtproject.io",
						"display_url": "app.galtproject.io",
						"unwound_url": "http://app.galtproject.io"
					}]
				},
				"context_annotations": [{
					"domain": {
						"id": "45",
						"name": "Brand Vertical",
						"description": "Top level entities that describe a Brands industry"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					}, "entity": {"id": "781974596794716162", "name": "Financial services"}
				}, {
					"domain": {
						"id": "30",
						"name": "Entities [Entity Service]",
						"description": "Entity Service top level domain, every item that is in Entity Service should be in this domain"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {
						"id": "847868745150119936",
						"name": "Family & relationships",
						"description": "Hobbies and interests"
					}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {
						"id": "1007361429752594432",
						"name": "Ethereum cryptocurrency",
						"description": "Ethereum Cryptocurrency"
					}
				}, {
					"domain": {
						"id": "65",
						"name": "Interests and Hobbies Vertical",
						"description": "Top level interests and hobbies groupings, like Food or Travel"
					}, "entity": {"id": "781974596148793345", "name": "Business & finance"}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {
						"id": "847888632711061504",
						"name": "Personal finance",
						"description": "Personal finance"
					}
				}, {
					"domain": {
						"id": "66",
						"name": "Interests and Hobbies Category",
						"description": "A grouping of interests and hobbies entities, like Novelty Food or Destinations"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {
						"id": "847868745150119936",
						"name": "Family & relationships",
						"description": "Hobbies and interests"
					}
				}, {
					"domain": {
						"id": "131",
						"name": "Unified Twitter Taxonomy",
						"description": "A taxonomy view into the Semantic Core knowledge graph"
					},
					"entity": {"id": "913142676819648512", "name": "Cryptocurrencies", "description": "Cryptocurrency"}
				}],
				"author_id": "1041654490523287552",
				"created_at": "2020-01-15T11:23:20.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"source": "Twitter for iPhone",
				"reply_settings": "everyone",
				"conversation_id": "1217406911303372800",
				"text": "Hey everyone! 🎊 Amazing news! Galt•Project is live on Ethereum mainnet. More details here: https://t.co/1y7g8B7tMN.  DApp is here: https://t.co/Ey9CKYSBph Put your land, house or apartment on Ethereum! Create community and Vote! #ethereum #dao #web3 #DApps #ETH #PropTech",
				"id": "1217406911303372800"
			},
			{
				"author_id": "783283130958569472",
				"created_at": "2019-08-30T13:35:17.000Z",
				"possibly_sensitive": false,
				"lang": "und",
				"source": "Twitter for Android",
				"entities": {
					"mentions": [{"start": 0, "end": 10, "username": "chebyster", "id": "197293842"}, {
						"start": 11,
						"end": 21,
						"username": "jony_bang",
						"id": "1500113611108196356"
					}]
				},
				"referenced_tweets": [{"type": "replied_to", "id": "1167413304584785921"}],
				"reply_settings": "everyone",
				"in_reply_to_user_id": "197293842",
				"conversation_id": "1167413304584785921",
				"text": "@chebyster @jony_bang Ебать женя fabulous",
				"id": "1167430592335622144"
			},
			{
				"author_id": "3142378517",
				"created_at": "2019-05-03T23:09:05.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1124450638400716801"]},
				"source": "Twitter Web Client",
				"entities": {
					"mentions": [{"start": 56, "end": 67, "username": "passportjs", "id": "401463291"}],
					"urls": [{
						"start": 68,
						"end": 91,
						"url": "https://t.co/rd5WWeQiId",
						"expanded_url": "https://twitter.com/jony_bang/status/1124450838188052481/photo/1",
						"display_url": "pic.twitter.com/rd5WWeQiId",
						"media_key": "3_1124450638400716801"
					}]
				},
				"reply_settings": "everyone",
				"conversation_id": "1124450838188052481",
				"text": "😑 Too hard to read. Where is switcher to light theme? 😆\n@passportjs https://t.co/rd5WWeQiId",
				"id": "1124450838188052481"
			},
			{
				"author_id": "3142378517",
				"created_at": "2019-05-02T12:51:18.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1123932947881582594", "3_1123932965329952770"]},
				"source": "Twitter for Android",
				"reply_settings": "everyone",
				"conversation_id": "1123932977195515904",
				"text": "Who would win? https://t.co/5CGtg47NMU",
				"id": "1123932977195515904",
				"entities": {
					"urls": [{
						"start": 15,
						"end": 38,
						"url": "https://t.co/5CGtg47NMU",
						"expanded_url": "https://twitter.com/jony_bang/status/1123932977195515904/photo/1",
						"display_url": "pic.twitter.com/5CGtg47NMU",
						"media_key": "3_1123932947881582594"
					}, {
						"start": 15,
						"end": 38,
						"url": "https://t.co/5CGtg47NMU",
						"expanded_url": "https://twitter.com/jony_bang/status/1123932977195515904/photo/1",
						"display_url": "pic.twitter.com/5CGtg47NMU",
						"media_key": "3_1123932965329952770"
					}]
				}
			},
			{
				"entities": {
					"hashtags": [{"start": 11, "end": 15, "tag": "bjd"}, {
						"start": 16,
						"end": 32,
						"tag": "balljointeddoll"
					}, {"start": 33, "end": 38, "tag": "doll"}, {"start": 39, "end": 46, "tag": "zombie"}, {
						"start": 47,
						"end": 57,
						"tag": "fairyland"
					}],
					"urls": [{
						"start": 58,
						"end": 81,
						"url": "https://t.co/042cUgItDi",
						"expanded_url": "https://twitter.com/zeligenm/status/1117795803005845504/photo/1",
						"display_url": "pic.twitter.com/042cUgItDi",
						"media_key": "3_1117795791274500102"
					}]
				},
				"author_id": "781435180800176128",
				"created_at": "2019-04-15T14:24:21.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"attachments": {"media_keys": ["3_1117795791274500102"]},
				"source": "Twitter for Android",
				"reply_settings": "everyone",
				"conversation_id": "1117795803005845504",
				"text": "Brains plz #bjd #balljointeddoll #doll #zombie #fairyland https://t.co/042cUgItDi",
				"id": "1117795803005845504"
			}
		],
		"media": [
			{
				"media_key": "3_1317238234095779846",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EkfFMePXgAYd1zm.jpg"
			}, {
				"media_key": "3_1317238236327063553",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EkfFMmjWMAEpGZ0.jpg"
			}, {
				"media_key": "3_1289679911796576258",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EeXdC_iXkAISk6X.jpg"
			}, {
				"media_key": "3_1228370112291524609",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EQwMG-PX0AEw1hX.jpg"
			}, {
				"media_key": "3_1228370120042569728",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EQwMHbHXYAA3SP5.jpg"
			}, {
				"media_key": "3_1228369041208811520",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EQwLIoJWoAANMJC.jpg"
			}, {
				"media_key": "3_1228369048309768198",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EQwLJCmWoAY37Ji.jpg"
			}, {
				"media_key": "3_1218102715173220354",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EOeR9zXWsAIzjf2.jpg"
			}, {
				"media_key": "3_1182615617603604480",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/EGl-o3EXkAATDov.jpg"
			}, {
				"media_key": "3_1126597347973242889",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D6J6UarXoAkspq4.jpg"
			}, {
				"media_key": "3_1124451483641106432",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D5raqrGW0AAvDai.jpg"
			}, {
				"media_key": "3_1124450638400716801",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D5rZ5eVWAAEWB7C.jpg"
			}, {
				"media_key": "3_1123933187758088195",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D5kDR4eX4AMZGj5.jpg"
			}, {
				"media_key": "3_1123932947881582594",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D5kDD63W4AIzg04.jpg"
			}, {
				"media_key": "3_1123932965329952770",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D5kDE73X4AIaID2.jpg"
			}, {
				"media_key": "3_1117942294227881984",
				"type": "photo",
				"url": "https://pbs.twimg.com/media/D4O6l-7WkAAtD_H.jpg"
			}]
	};
	const mediasByKey = {};
	includes.media.forEach(item => {
		mediasByKey[item.media_key] = item;
	});
	const tweetsById = {};
	includes.tweets.forEach(item => {
		tweetsById[item.id] = item;
	});
	const channelsById = {};
	includes.users.forEach(item => {
		channelsById[item.id] = item;
	});

	it('entities and line breaks should handle correctly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const m = {
			"attachments": {"media_keys": ["3_1289679911796576258"]},
			"created_at": "2020-08-01T21:50:27.000Z",
			"reply_settings": "everyone",
			"source": "Twitter for Android",
			"entities": {
				"urls": [{
					"start": 114,
					"end": 137,
					"url": "https://t.co/UUvfhl88b2",
					"expanded_url": "https://twitter.com/jony_bang/status/1289679914124247040/photo/1",
					"display_url": "pic.twitter.com/UUvfhl88b2",
					"media_key": "3_1289679911796576258"
				}], "mentions": [{"start": 15, "end": 27, "username": "fontawesome", "id": "515543735"}]
			},
			"conversation_id": "1289679914124247040",
			"possibly_sensitive": false,
			"author_id": "3142378517",
			"text": "It's not cool, @fontawesome why did you spam several messages in a day to me? I should have unsubscribed long ago https://t.co/UUvfhl88b2",
			"lang": "en",
			"id": "1289679914124247040"
		};

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const contents = await twitterClient.messageToContents(testUser.id, channel, m, mediasByKey);
		assert.equal(contents.length, 2);
		const [messageContent, imageContent] = contents;
		assert.equal(messageContent.view, ContentView.Contents);
		assert.equal(imageContent.view, ContentView.Media);

		const testPost = await app.ms.group.createPost(testUser.id, {
			contents,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', testPost);
		assert.equal(postContents.length, 2);
		const [messageC, imageC] = postContents;

		assert.equal(messageC.type, 'text');
		assert.equal(messageC.mimeType, 'text/html');
		assert.equal(messageC.view, 'contents');
		assert.equal(messageC.text, "It's not cool, @fontawesome why did you spam several messages in a day to me? I should have unsubscribed long ago");
		assert.equal(messageC.manifestId, 'bafyreihs2buxiuh7m5bqkq57pnthcoa2hvxc2oq2w7kthijmanodckpuya');

		assert.equal(imageC.type, 'image');
		assert.equal(imageC.mimeType, 'image/jpeg');
		assert.equal(imageC.view, 'media');
		assert.equal(imageC.url, 'https://my.site/ipfs/bafkreihlgzev575iuq3stroxmymtprwbfpd4aocdrreqmtzxgbitvcfc5e');
		assert.equal(imageC.manifestId, 'bafyreifukz7avkeb6rhkmj4jgnqv3u2e72ipbnmrezdui5d47fzjgdv3le');
	});

	it('webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const m = {
			"author_id": "3142378517",
			"created_at": "2021-05-21T22:39:35.000Z",
			"possibly_sensitive": false,
			"lang": "en",
			"source": "Twitter for Android",
			"entities": {
				"mentions": [{
					"start": 0,
					"end": 14,
					"username": "sparkpool_eth",
					"id": "955345726858452992"
				}]
			},
			"referenced_tweets": [{"type": "replied_to", "id": "1395662836840288261"}],
			"reply_settings": "everyone",
			"in_reply_to_user_id": "955345726858452992",
			"conversation_id": "1395662646951641090",
			"text": "@sparkpool_eth Can you please share the link of this page?",
			"id": "1395871923561803781"
		};

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const contents = await twitterClient.messageToContents(testUser.id, channel, m, mediasByKey);
		assert.equal(contents.length, 1);
		const [messageContent] = contents;
		assert.equal(messageContent.view, ContentView.Contents);

		const testPost = await app.ms.group.createPost(testUser.id, {
			contents,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', testPost);
		assert.equal(postContents.length, 1);
		const [messageC] = postContents;

		assert.equal(messageC.text, "It's not cool, @fontawesome why did you spam several messages in a day to me? I should have unsubscribed long ago");
		assert.equal(messageC.manifestId, 'bafyreihs2buxiuh7m5bqkq57pnthcoa2hvxc2oq2w7kthijmanodckpuya');
	});

	it('local webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message = {
			id: 1247,
			replyTo: null,
			date: 1651067259,
			message: 'https://t.me/inside_microwave/161',
			entities: [
				{
					CONSTRUCTOR_ID: 1859134776,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityUrl',
					classType: 'constructor',
					offset: 0,
					length: 33
				}
			],
			media: {
				CONSTRUCTOR_ID: 2737690112,
				SUBCLASS_OF_ID: 1198308914,
				className: 'MessageMediaWebPage',
				classType: 'constructor',
				webpage: {
					CONSTRUCTOR_ID: 3902555570,
					SUBCLASS_OF_ID: 1437168769,
					className: 'WebPage',
					classType: 'constructor',
					flags: 15,
					id: 1437168769,
					url: 'https://t.me/inside_microwave/161',
					displayUrl: 't.me/inside_microwave/161',
					hash: 0,
					type: 'telegram_message',
					siteName: 'Telegram',
					title: 'Внутри Микроволновки',
					description: 'Для всех новоприбывших: если вы увидели тут какие-то сложные посты про #блокчейн - то настоятельно рекомендую прочитать тред про него с начала.\n' +
						'\n' +
						'Вот первый пост:\n' +
						'https://t.me/inside_microwave/33\n' +
						'Я там сделал цепочку из ссылок на следующие посты, так что читать должно быть удобно\n' +
						'\n' +
						'Ещё написал FAQ с описанием терминов, которые юзаю в треде:\n' +
						'telegra.ph/Blockchain-FAQ-06-22\n' +
						'\n' +
						'Фишка в том что я стараюсь объяснить блокчейн и экосистему вокруг него так, чтобы он был понятен простому человеку, ну и заодно то, что блокчейн не равно биткоин, всё гораздо сложнее и интереснее. Рассказываю также про смарт контракты и децентрализованные финансы то что знаю, и надеюсь что получается донести почему я считаю эту технологию перспективной и крутой.\n' +
						'\n' +
						'А вообще я очень рад что сюда подключается много интересных и, что самое главное, адекватных людей, я давно хочу сформировать островок адекватности на котором люди с разными точками зрения будут учиться…',
					photo: null,
					embedUrl: null,
					embedType: null,
					embedWidth: null,
					embedHeight: null,
					duration: null,
					author: null,
					document: null,
					cachedPage: null,
					attributes: null
				}
			},
			action: undefined,
			groupedId: null
		};


		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const contents = await twitterClient.messageToContents(null, testUser.id, channel, message);
		assert.equal(contents.length, 2);
		const [textContent, linkContent] = contents;
		assert.equal(linkContent.view, ContentView.Link);
		assert.equal(linkContent.mimeType, 'application/json');
		assert.equal(await app.ms.storage.getFileDataText(linkContent.storageId), JSON.stringify({
			"url": "https://t.me/inside_microwave/161",
			"displayUrl": "t.me/inside_microwave/161",
			"siteName": "Telegram",
			"title": "Внутри Микроволновки",
			"description": "Для всех новоприбывших: если вы увидели тут какие-то сложные посты про #блокчейн - то настоятельно рекомендую прочитать тред про него с начала.\n\nВот первый пост:\nhttps://t.me/inside_microwave/33\nЯ там сделал цепочку из ссылок на следующие посты, так что читать должно быть удобно\n\nЕщё написал FAQ с описанием терминов, которые юзаю в треде:\ntelegra.ph/Blockchain-FAQ-06-22\n\nФишка в том что я стараюсь объяснить блокчейн и экосистему вокруг него так, чтобы он был понятен простому человеку, ну и заодно то, что блокчейн не равно биткоин, всё гораздо сложнее и интереснее. Рассказываю также про смарт контракты и децентрализованные финансы то что знаю, и надеюсь что получается донести почему я считаю эту технологию перспективной и крутой.\n\nА вообще я очень рад что сюда подключается много интересных и, что самое главное, адекватных людей, я давно хочу сформировать островок адекватности на котором люди с разными точками зрения будут учиться…",
			"type": "url"
		}));
		assert.equal(textContent.view, ContentView.Contents);
	});

	it('should merge posts by timestamp', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message1 = {
			id: 1244,
			replyTo: null,
			date: 1650964373,
			message: 'jump to message 👇',
			entities: [
				{
					CONSTRUCTOR_ID: 1990644519,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityTextUrl',
					classType: 'constructor',
					offset: 0,
					length: 18,
					url: 'https://t.me/ctodailychat/267937'
				}
			],
			media: null,
			action: undefined,
			groupedId: null
		};

		const message2 = {
			id: 1245,
			replyTo: null,
			date: 1650964374,
			message: 'https://twitter.com/benstopford/status/1518544410191007746\n' +
				'\n(превьюха не грузится и твиттер не дает скопировать текст)',
			entities: [
				{
					CONSTRUCTOR_ID: 1859134776,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityUrl',
					classType: 'constructor',
					offset: 0,
					length: 58
				}
			],
			media: {
				CONSTRUCTOR_ID: 1766936791,
				SUBCLASS_OF_ID: 1198308914,
				className: 'MessageMediaPhoto',
				classType: 'constructor',
				flags: 1,
				photo: {
					CONSTRUCTOR_ID: 4212750949,
					SUBCLASS_OF_ID: 3581324060,
					className: 'Photo',
					classType: 'constructor',
					flags: 0,
					hasStickers: false,
					id: 0,
					accessHash: 0,
					fileReference: Buffer.from([/*02 50 ef 70 e0 00 00 04 dd 62 6b db 4a ea 35 3c 7c f2 20 b0 d6 c4 84 2f 5e 1e 5c 8c df*/]),
					date: 1650925653,
					sizes: [
						{
							CONSTRUCTOR_ID: 3769678894,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoStrippedSize',
							classType: 'constructor',
							type: 'i',
							bytes: Buffer.from([/*01 1b 28 ba e2 7f b7 a1 50 e6 3c 73 f3 7c a3 f0 ab 18 93 1f 78 fe 63 fc 29 18 90 fc 67 f3 14 87 3e ad d3 fb c2 80 25 5c e3 9a 5a 88 96 e7 19 f6 f9 85 ... 65 more bytes*/]),
						},
						{
							CONSTRUCTOR_ID: 1976012384,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSize',
							classType: 'constructor',
							type: 'm',
							w: 320,
							h: 212,
							size: 18298
						},
						{
							CONSTRUCTOR_ID: 4198431637,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSizeProgressive',
							classType: 'constructor',
							type: 'x',
							w: 750,
							h: 496,
							sizes: [3341, 9007, 17892, 25486, 39802]
						}
					],
					videoSizes: null,
					dcId: 2
				},
				ttlSeconds: null
			},
			action: undefined,
			groupedId: null
		};

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const importState = {
			mergeSeconds: 5,
			userId: testUser.id,
			groupId: testGroup.id,
		};

		const postData = {
			groupId: testGroup.id,
			status: 'published',
			source: 'telegram',
			sourceChannelId: channel.channelId,
			sourcePostId: message1.id,
			sourceDate: new Date(message1.date * 1000),
			contents: [],
			properties: {},
		}

		const msgData = {dbChannelId: channel.id, userId: testUser.id, timestamp: message1.date, msgId: message1.id};

		const contents1 = await twitterClient.messageToContents(null, testUser.id, channel, message1);
		assert.equal(contents1.length, 1);
		assert.equal(contents1[0].manifestStorageId, 'bafyreic4hvcncqyg7s52yc2vhl7nqygx2iyw5act57zc3yt72xtc4wemga');

		postData.contents = contents1;
		let post1 = await socNetImport.publishPost(importState, null, postData, msgData);
		assert.equal(post1.contents.length, 1);

		const existsChannelMessagePost1 = await socNetImport.findExistsChannelMessage(message1.id, channel.id, testUser.id);
		post1 = await socNetImport.publishPost(importState, existsChannelMessagePost1, postData, msgData);
		assert.equal(post1.contents.length, 1);

		const contents2 = await twitterClient.messageToContents(null, testUser.id, channel, message2);
		assert.equal(contents2.length, 2);
		assert.equal(contents2[0].manifestStorageId, 'bafyreihjglmtrd6tqyyqqqwwg67ljpy3z4hfenvakuylj5vyn7hbrfqei4');
		assert.equal(contents2[1].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');

		postData.sourcePostId = message2.id;
		postData.sourceDate = new Date(message2.date * 1000);
		postData.contents = contents2;

		msgData.timestamp = message2.date;
		msgData.msgId = message2.id;

		const post2 = await socNetImport.publishPost(importState, null, postData, msgData);
		assert.equal(post2.id, post1.id);
		assert.equal(post2.contents.length, 3);
		assert.equal(post2.contents[0].manifestStorageId, 'bafyreic4hvcncqyg7s52yc2vhl7nqygx2iyw5act57zc3yt72xtc4wemga');
		assert.equal(post2.contents[1].manifestStorageId, 'bafyreihjglmtrd6tqyyqqqwwg67ljpy3z4hfenvakuylj5vyn7hbrfqei4');
		assert.equal(post2.contents[2].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');

		message1.message = 'test';
		message1.entities = [];
		const contents3 = await twitterClient.messageToContents(null, testUser.id, channel, message1);
		assert.equal(contents3.length, 1);
		assert.equal(contents3[0].manifestStorageId, 'bafyreichk3lcfjjzyzpisrnejebqqojppvpjowl7m6tshmg67jlql6dhaq');

		message1.id -= 1;
		message1.date -= 10;
		postData.contents = contents3;

		postData.sourcePostId = message1.id;
		postData.sourceDate = new Date(message1.date * 1000);
		postData.contents = contents3;

		msgData.timestamp = message1.date;
		msgData.msgId = message1.id;

		let post3 = await socNetImport.publishPost(importState, null, postData, msgData);
		const post3PrevId = post3.id;
		assert.equal(post3.contents.length, 1);
		assert.notEqual(post2.id, post3.id);

		message1.date += 9;
		msgData.timestamp = message1.date;

		const existsChannelMessage = await socNetImport.findExistsChannelMessage(message1.id, channel.id, testUser.id);
		assert.equal(existsChannelMessage.msgId, message1.id);

		post3 = await socNetImport.publishPost(importState, existsChannelMessage, postData, msgData);
		assert.equal(post3.contents.length, 4);
		assert.equal(post3.contents[0].manifestStorageId, 'bafyreic4hvcncqyg7s52yc2vhl7nqygx2iyw5act57zc3yt72xtc4wemga');
		assert.equal(post3.contents[1].manifestStorageId, 'bafyreichk3lcfjjzyzpisrnejebqqojppvpjowl7m6tshmg67jlql6dhaq');
		assert.equal(post3.contents[2].manifestStorageId, 'bafyreihjglmtrd6tqyyqqqwwg67ljpy3z4hfenvakuylj5vyn7hbrfqei4');
		assert.equal(post3.contents[3].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');
		assert.equal(post2.id, post3.id);

		post3 = await app.ms.group.getPost(testUser.id, post3PrevId);
		assert.equal(post3.isDeleted, true);
	});

	it('should merge two group of posts by timestamp', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const messages = [
			{
				id: 1207,
				replyTo: null,
				date: 1649028625,
				message: 'jump to message 👇',
				entities: [
					{
						CONSTRUCTOR_ID: 1990644519,
						SUBCLASS_OF_ID: 3479443932,
						className: 'MessageEntityTextUrl',
						classType: 'constructor',
						offset: 0,
						length: 18,
						url: 'https://t.me/ctodailychat/263223'
					}
				],
				media: null,
				action: undefined,
				groupedId: null
			},
			{
				id: 1210,
				replyTo: null,
				date: 1649028943,
				message: 'держи)',
				entities: null,
				media: {
					CONSTRUCTOR_ID: 1766936791,
					SUBCLASS_OF_ID: 1198308914,
					className: 'MessageMediaPhoto',
					classType: 'constructor',
					flags: 1,
					photo: {
						CONSTRUCTOR_ID: 4212750949,
						SUBCLASS_OF_ID: 3581324060,
						className: 'Photo',
						classType: 'constructor',
						flags: 0,
						hasStickers: false,
						id: 4212750949,
						accessHash: 3581324060,
						fileReference: Buffer.from([/*02 50 ef 70 e0 00 00 04 ba 62 6e 09 b9 c4 6b 2b db 2d 9c c3 7a 2b 7b 69 2e 9f 75 0b c1*/]),
						date: 1649023284,
						sizes: [
							{
								CONSTRUCTOR_ID: 3769678894,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoStrippedSize',
								classType: 'constructor',
								type: 'i',
								bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/]),
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'm',
								w: 148,
								h: 320,
								size: 9356
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'x',
								w: 369,
								h: 800,
								size: 33650
							},
							{
								CONSTRUCTOR_ID: 4198431637,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSizeProgressive',
								classType: 'constructor',
								type: 'y',
								w: 591,
								h: 1280,
								sizes: [5161, 12582, 23194, 30735, 46885]
							}
						],
						videoSizes: null,
						dcId: 2
					},
					ttlSeconds: null
				},
				action: undefined,
				groupedId: 13192231545901354
			},
			{
				id: 1211,
				replyTo: null,
				date: 1649028943,
				message: '',
				entities: null,
				media: {
					CONSTRUCTOR_ID: 1766936791,
					SUBCLASS_OF_ID: 1198308914,
					className: 'MessageMediaPhoto',
					classType: 'constructor',
					flags: 1,
					photo: {
						CONSTRUCTOR_ID: 4212750949,
						SUBCLASS_OF_ID: 3581324060,
						className: 'Photo',
						classType: 'constructor',
						flags: 0,
						hasStickers: false,
						id: 4212750949,
						accessHash: 3581324060,
						fileReference: Buffer.from([/*02 50 ef 70 e0 00 00 04 bb 62 6e 09 b9 89 8f 97 e3 29 33 4a 4c dd 77 69 3a 69 1a 5c 20*/]),
						date: 1649023285,
						sizes: [
							{
								CONSTRUCTOR_ID: 3769678894,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoStrippedSize',
								classType: 'constructor',
								type: 'i',
								bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/]),
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'm',
								w: 148,
								h: 320,
								size: 9356
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'x',
								w: 369,
								h: 800,
								size: 33650
							},
							{
								CONSTRUCTOR_ID: 4198431637,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSizeProgressive',
								classType: 'constructor',
								type: 'y',
								w: 591,
								h: 1280,
								sizes: [5161, 12582, 23194, 30735, 46885]
							}
						],
						videoSizes: null,
						dcId: 2
					},
					ttlSeconds: null
				},
				action: undefined,
				groupedId: 13192231545901354
			},
			{
				id: 1212,
				replyTo: null,
				date: 1649064970,
				message: 'jump to message 👇',
				entities: [
					{
						CONSTRUCTOR_ID: 1990644519,
						SUBCLASS_OF_ID: 3479443932,
						className: 'MessageEntityTextUrl',
						classType: 'constructor',
						offset: 0,
						length: 18,
						url: 'https://t.me/ctodailychat/263251'
					}
				],
				media: null,
				action: undefined,
				groupedId: null
			},
			{
				id: 1213,
				replyTo: null,
				date: 1649064970,
				message: 'https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
				entities: [
					{
						CONSTRUCTOR_ID: 1859134776,
						SUBCLASS_OF_ID: 3479443932,
						className: 'MessageEntityUrl',
						classType: 'constructor',
						offset: 0,
						length: 81
					}
				],
				media: {
					CONSTRUCTOR_ID: 2737690112,
					SUBCLASS_OF_ID: 1198308914,
					className: 'MessageMediaWebPage',
					classType: 'constructor',
					webpage: {
						CONSTRUCTOR_ID: 3902555570,
						SUBCLASS_OF_ID: 1437168769,
						className: 'WebPage',
						classType: 'constructor',
						flags: 15,
						id: 3902555570,
						url: 'https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
						displayUrl: 'dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
						hash: 0,
						type: 'article',
						siteName: 'dustri.org',
						title: 'Horrible edge cases to consider when dealing with music',
						description: 'Personal blog of Julien (jvoisin) Voisin',
						photo: null,
						embedUrl: null,
						embedType: null,
						embedWidth: null,
						embedHeight: null,
						duration: null,
						author: null,
						document: null,
						cachedPage: null,
						attributes: null
					}
				},
				action: undefined,
				groupedId: null
			}
		];

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const importState = {
			mergeSeconds: 5,
			userId: testUser.id,
			groupId: testGroup.id,
		};

		for (let j = 0; j < 2; j++) {
			let groupedContents = [];
			let groupedId;
			await pIteration.forEachSeries(messages, async (m, i) => {
				const postData = {
					groupId: testGroup.id,
					status: 'published',
					source: 'telegram',
					sourceChannelId: channel.channelId,
					sourcePostId: m.id,
					sourceDate: new Date(m.date * 1000),
					contents: [],
					properties: {},
				}
				const msgData = {dbChannelId: channel.id, userId: testUser.id, timestamp: m.date, msgId: m.id};

				const contents = await twitterClient.messageToContents(null, testUser.id, channel, m);
				postData.sourcePostId = m.id;
				postData.sourceDate = new Date(m.date * 1000);

				if (m.groupedId) {
					groupedId = m.groupedId;
					groupedContents = contents.concat(groupedContents);
					if (!messages[i + 1] || !messages[i + 1].groupedId) {
						postData.contents = groupedContents;
						await socNetImport.publishPost(importState, null, postData, msgData);
					}
				} else {
					postData.contents = contents;
					await socNetImport.publishPost(importState, null, postData, msgData);
				}
			});

			const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id);
			assert.equal(groupPosts.length, 3);
			const [horribleEdgeCases, spotifyPremium, link] = groupPosts;

			console.log(link.publishedAt.getTime() / 1000);
			console.log(spotifyPremium.publishedAt.getTime() / 1000);
			console.log(horribleEdgeCases.publishedAt.getTime() / 1000);
			assert.equal(link.contents.length, 1);
			assert.equal(spotifyPremium.contents.length, 3);
			assert.equal(horribleEdgeCases.contents.length, 3);

			assert.equal(await app.ms.storage.getFileDataText(link.contents[0].storageId), '<a href="https://t.me/ctodailychat/263223">jump to message 👇</a>');
			assert.equal(await app.ms.storage.getFileDataText(spotifyPremium.contents[0].storageId), 'держи)');
			assert.equal(spotifyPremium.contents[1].mimeType, 'image/jpg');
			assert.equal(spotifyPremium.contents[2].mimeType, 'image/jpg');

			const postContents = await app.ms.group.getPostContent(horribleEdgeCases);
			assert.equal(postContents[0].text, '<a href="https://t.me/ctodailychat/263251">jump to message 👇</a>');
			assert.equal(postContents[0].type, 'text');
			assert.equal(postContents[0].mimeType, 'text/html');
			assert.equal(postContents[0].view, 'contents');

			assert.equal(postContents[1].text, '<a href="https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html">https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html</a>');
			assert.equal(postContents[1].type, 'text');
			assert.equal(postContents[1].mimeType, 'text/html');
			assert.equal(postContents[1].view, 'contents');

			assert.equal(postContents[2].type, 'json');
			assert.deepEqual(postContents[2].json, {
				url: 'https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
				displayUrl: 'dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
				siteName: 'dustri.org',
				title: 'Horrible edge cases to consider when dealing with music',
				description: 'Personal blog of Julien (jvoisin) Voisin',
				type: 'url'
			});
			assert.equal(postContents[2].mimeType, 'application/json');
			assert.equal(postContents[2].view, 'link');

			assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[0].storageId), '<a href="https://t.me/ctodailychat/263251">jump to message 👇</a>');
			assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[1].storageId), '<a href="https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html">https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html</a>');
			assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[2].storageId), JSON.stringify({
				"url": "https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html",
				"displayUrl": "dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html",
				"siteName": "dustri.org",
				"title": "Horrible edge cases to consider when dealing with music",
				"description": "Personal blog of Julien (jvoisin) Voisin",
				"type": "url"
			}));
		}
	});

	it('should merge posts by groupedId', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message1 = {
			id: 1210,
			replyTo: null,
			date: 1649028943,
			message: 'держи)',
			entities: null,
			media: {
				CONSTRUCTOR_ID: 1766936791,
				SUBCLASS_OF_ID: 1198308914,
				className: 'MessageMediaPhoto',
				classType: 'constructor',
				flags: 1,
				photo: {
					CONSTRUCTOR_ID: 4212750949,
					SUBCLASS_OF_ID: 3581324060,
					className: 'Photo',
					classType: 'constructor',
					flags: 0,
					hasStickers: false,
					id: 4212750949,
					accessHash: 3581324060,
					fileReference: Buffer.from([/*02 50 ef 70 e0 00 00 04 ba 62 6c c1 0d af d3 68 9d 1f ee df 85 7b cf 66 d2 d1 55 ed 43*/]),
					date: 1649023284,
					sizes: [
						{
							CONSTRUCTOR_ID: 3769678894,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoStrippedSize',
							classType: 'constructor',
							type: 'i',
							bytes: Buffer.from([/*01 28 13 d3 a2 99 21 f9 70 06 4d 45 1c ac 25 d9 20 03 3c 71 93 53 62 0b 14 51 45 02 2a ca 92 99 c9 57 c0 e3 03 f2 a6 4b 11 92 5d f9 e8 7a 72 6a 7b 89 ... 51 more bytes*/]),
						},
						{
							CONSTRUCTOR_ID: 1976012384,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSize',
							classType: 'constructor',
							type: 'm',
							w: 148,
							h: 320,
							size: 10621
						},
						{
							CONSTRUCTOR_ID: 1976012384,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSize',
							classType: 'constructor',
							type: 'x',
							w: 369,
							h: 800,
							size: 40330
						},
						{
							CONSTRUCTOR_ID: 4198431637,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSizeProgressive',
							classType: 'constructor',
							type: 'y',
							w: 591,
							h: 1280,
							sizes: [5923, 15115, 28050, 38041, 59580]
						}
					]
					,
					videoSizes: null,
					dcId: 2
				},
				ttlSeconds: null
			},
			action: undefined,
			groupedId: 13192231545901354
		};

		const message2 = {
			id: 1211,
			replyTo: null,
			date: 1649028943,
			message: '',
			entities: null,
			media: {
				CONSTRUCTOR_ID: 1766936791,
				SUBCLASS_OF_ID: 1198308914,
				className: 'MessageMediaPhoto',
				classType: 'constructor',
				flags: 1,
				photo: {
					CONSTRUCTOR_ID: 4212750949,
					SUBCLASS_OF_ID: 3581324060,
					className: 'Photo',
					classType: 'constructor',
					flags: 0,
					hasStickers: false,
					id: 3581324060,
					accessHash: 3581324060,
					fileReference: Buffer.from([/*02 50 ef 70 e0 00 00 04 bb 62 6c c1 0d 7e 15 5b e1 09 68 33 c1 05 20 a6 82 6e fe 3d 23*/]),
					date: 1649023285,
					sizes: [
						{
							CONSTRUCTOR_ID: 3769678894,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoStrippedSize',
							classType: 'constructor',
							type: 'i',
							bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/]),
						},
						{
							CONSTRUCTOR_ID: 1976012384,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSize',
							classType: 'constructor',
							type: 'm',
							w: 148,
							h: 320,
							size: 9356
						},
						{
							CONSTRUCTOR_ID: 1976012384,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSize',
							classType: 'constructor',
							type: 'x',
							w: 369,
							h: 800,
							size: 33650
						},
						{
							CONSTRUCTOR_ID: 4198431637,
							SUBCLASS_OF_ID: 399256025,
							className: 'PhotoSizeProgressive',
							classType: 'constructor',
							type: 'y',
							w: 591,
							h: 1280,
							sizes: [5161, 12582, 23194, 30735, 46885]
						}
					],
					videoSizes: null,
					dcId: 2
				},
				ttlSeconds: null
			},
			action: undefined,
			groupedId: 13192231545901354
		};

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const importState = {
			mergeSeconds: 5,
			userId: testUser.id,
			groupId: testGroup.id,
		};

		const postData = {
			groupId: testGroup.id,
			status: 'published',
			source: 'telegram',
			sourceChannelId: channel.channelId,
			sourcePostId: message1.id,
			sourceDate: new Date(message1.date * 1000),
			contents: [],
			properties: {},
		}

		const msgData = {
			dbChannelId: channel.id,
			userId: testUser.id,
			timestamp: message1.date,
			groupedId: message1.groupedId,
			msgId: message1.id
		};

		const contents1 = await twitterClient.messageToContents(null, testUser.id, channel, message1);
		assert.equal(contents1.length, 2);
		assert.equal(contents1[0].manifestStorageId, 'bafyreihrydk7t5w3vxixxzyqmkeyz6bw3kvqvhux2llfigu5js4nzg5rmm');
		assert.equal(contents1[1].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');

		postData.contents = contents1;
		let post1 = await socNetImport.publishPost(importState, null, postData, msgData);
		assert.equal(post1.contents.length, 2);

		const contents2 = await twitterClient.messageToContents(null, testUser.id, channel, message2);
		assert.equal(contents2.length, 1);
		assert.equal(contents2[0].manifestStorageId, 'bafyreifoksuhwlkn73jgzcbluzwvf3g62cpbuki6igalddkmgoexwcy3pm');

		postData.sourcePostId = message2.id;
		postData.sourceDate = new Date(message2.date * 1000);
		postData.contents = contents2;
		msgData.msgId = message2.id

		const post2 = await socNetImport.publishPost(importState, null, postData, msgData);
		assert.equal(post2.id, post1.id);
		assert.equal(post2.contents.length, 3);
		assert.equal(post2.contents[0].manifestStorageId, 'bafyreihrydk7t5w3vxixxzyqmkeyz6bw3kvqvhux2llfigu5js4nzg5rmm');
		assert.equal(post2.contents[1].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');
		assert.equal(post2.contents[2].manifestStorageId, 'bafyreifoksuhwlkn73jgzcbluzwvf3g62cpbuki6igalddkmgoexwcy3pm');
	});
});

function _base64ToArrayBuffer(base64) {
	let binary_string = atob(base64);
	let len = binary_string.length;
	let bytes = new Uint8Array(len);
	for (let i = 0; i < len; i++) {
		bytes[i] = binary_string.charCodeAt(i);
	}
	return bytes;
}