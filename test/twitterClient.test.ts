/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import pIteration from 'p-iteration';
import {ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {TwitterImportClient} from "../app/modules/twitterClient/importClient.js";
import IGeesomeTwitterClient from "../app/modules/twitterClient/interface.js";
import IGeesomeSocNetAccount from "../app/modules/socNetAccount/interface.js";
import IGeesomeSocNetImport from "../app/modules/socNetImport/interface.js";
import twitterHelpers from '../app/modules/twitterClient/helpers.js';
import {IPost} from "../app/modules/group/interface.js";
import {IGeesomeApp} from "../app/interface.js";
import appHelpers from '../app/helpers.js';

describe.skip("twitterClient", function () {
	this.timeout(60000);

	let admin, app: IGeesomeApp, twitterClient: IGeesomeTwitterClient, socNetAccount: IGeesomeSocNetAccount,
		socNetImport: IGeesomeSocNetImport;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
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

			twitterClient['saveMedia'] = (userId, media) => {
				const content = appHelpers.base64ToArrayBuffer('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABR1BMVEUAAAAgM1cgM1cgM1cgNFggNFggM1cgM1cgM1cgM1ccO2MgM1cgM1cgM1cgM1cgM1cgM1ccPGQgM1cgM1cgM1cfNFkgM1cgM1cgM1c8TGw9Tm0gM1cgM1cgM1cgM1cgM1cgM1cgM1c9TW0+Tm0gM1cgM1clOFsPWY8Fba0BdrsFba4UTX0CdLgBd7wGbKspRGk2ir4UTX4DcrQbVoYmicQFbq8OWpAHaacfNFkHaqkOW5IXR3VWZH8TUIILYZsFbq4Bd7suQWMvQmTp6u4lPWIDdLcNXZYwQ2QZQ28SUoUXRnQeOmGnrryLlaf///94g5kWSXg3SWrk5utgbYcPWI8WSnlmc4y0usfGy9TS1t2dprXl5+wzRWYsPmBve5P8/PygqLf39/n9/f7W2eD5+fr3+Pl3gph5hJp3g5n4+Pnj5er+/v6gqLjJuAnyAAAAJ3RSTlMALJLU9PXVky0H/ZUIvL2Ulv0u1/X4+NbY/f4wl5m/wAmY/f4v2flxXoaXAAAAAW9yTlQBz6J3mgAAANdJREFUGNNjYAACRiZmFlY2dg4GCOBk51LX0NTUUufi5gHzebV1dIFAT9/AkA8kwq+tCwZGxia6hgJA/Vw6unCgIyjEwK6ua4oQMeNmYNMyt7CEC5gKM4hYWdvY6ura2YMFHEQZRBydnF1c3dw9NDU9tb28xRjEfXz9/AMCg4JDQsPCIyIlGPij/PyiYyL9omPj4v38EgQYhCQT/fyS/Pz8klP8/FKlpBkYZNL84CBdFuhSHrmMVAg3M11eAeQZHkWlhKzs7KwcZVkFqH9VBFTV1FRlpEFsANI2LfvWO/vxAAAAAElFTkSuQmCC');
				return app.ms.content.saveData(userId, content, '', {
					userId,
					mimeType: 'image/jpeg',
					view: ContentView.Media
				});
			};
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
	//{"id":"1296972062662234112","entities":{"urls":[{"start":13,"end":36,"url":"https://t.co/YLaRuCVX7F","expanded_url":"https://twitter.com/galtproject/status/1296887930074607616","display_url":"twitter.com/galtproject/st…"}]},"referenced_tweets":[{"type":"quoted","id":"1296887930074607616"}],"context_annotations":[{"domain":{"id":"45","name":"Brand Vertical","description":"Top level entities that describe a Brands industry"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"781974596794716162","name":"Financial services"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}},{"domain":{"id":"65","name":"Interests and Hobbies Vertical","description":"Top level interests and hobbies groupings, like Food or Travel"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"66","name":"Interests and Hobbies Category","description":"A grouping of interests and hobbies entities, like Novelty Food or Destinations"},"entity":{"id":"847888632711061504","name":"Personal finance","description":"Personal finance"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"857879456773357569","name":"Technology","description":"Technology"}},{"domain":{"id":"66","name":"Interests and Hobbies Category","description":"A grouping of interests and hobbies entities, like Novelty Food or Destinations"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"30","name":"Entities [Entity Service]","description":"Entity Service top level domain, every item that is in Entity Service should be in this domain"},"entity":{"id":"1001503516555337728","name":"Blockchain","description":"Blockchain"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"913142676819648512","name":"Cryptocurrencies","description":"Cryptocurrency"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"1007361429752594432","name":"Ethereum cryptocurrency","description":"Ethereum Cryptocurrency"}},{"domain":{"id":"65","name":"Interests and Hobbies Vertical","description":"Top level interests and hobbies groupings, like Food or Travel"},"entity":{"id":"781974596148793345","name":"Business & finance"}},{"domain":{"id":"66","name":"Interests and Hobbies Category","description":"A grouping of interests and hobbies entities, like Novelty Food or Destinations"},"entity":{"id":"847888632711061504","name":"Personal finance","description":"Personal finance"}},{"domain":{"id":"67","name":"Interests and Hobbies","description":"Interests, opinions, and behaviors of individuals, groups, or cultures; like Speciality Cooking or Theme Parks"},"entity":{"id":"847894737281470464","name":"Real estate","description":"Real estate"}},{"domain":{"id":"131","name":"Unified Twitter Taxonomy","description":"A taxonomy view into the Semantic Core knowledge graph"},"entity":{"id":"847894737281470464","name":"Real estate","description":"Real estate"}}],"lang":"en","reply_settings":"everyone","possibly_sensitive":false,"source":"Twitter for Android","author_id":"3142378517","created_at":"2020-08-22T00:46:50.000Z","text":"We did it! 🎉 https://t.co/YLaRuCVX7F","conversation_id":"1296972062662234112"}
	const includes = {
		"users": [
			{"username": "MicrowaveDev", "id": "3142378517", "profile_image_url": "https://pbs.twimg.com/profile_images/1465436672942878726/FQc-4TP__normal.jpg", "name": "Microwave Dev"},
			{"username": "sparkpool_eth", "id": "955345726858452992", "profile_image_url": "https://pbs.twimg.com/profile_images/1143714781666217984/aUVasr8L_normal.png", "name": "SparkPool"},
			{"username": "IliaAskey", "id": "846770450462072833", "profile_image_url": "https://pbs.twimg.com/profile_images/941128141115936768/LpKoSTDZ_normal.jpg", "name": "Ilia Askey"},
			{"username": "galtproject", "id": "1041654490523287552", "profile_image_url": "https://pbs.twimg.com/profile_images/1163710784377110529/LZCq11V4_normal.jpg", "name": "Galt Project"},
			{"username": "mudgen", "id": "6078352", "profile_image_url": "https://pbs.twimg.com/profile_images/1449724448614109189/lk5uULBG_normal.jpg", "name": "Nick Mudge 💎"},
			{"username": "UR_LYING_MORGAN", "id": "783283130958569472", "profile_image_url": "https://pbs.twimg.com/profile_images/1458073873937747976/7FLDP6xZ_normal.jpg", "name": "метатель кабанчиков"},
			{"username": "vasa_develop", "id": "893875627916378112", "profile_image_url": "https://pbs.twimg.com/profile_images/935095664165339136/ZL_MUi2U_normal.jpg", "name": "vasa"},
			{"username": "zeligenm", "id": "781435180800176128", "profile_image_url": "https://pbs.twimg.com/profile_images/1358412570881892354/8xHb-Nym_normal.jpg", "name": "Maria Zeligen"}
		],
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
					"urls": [{"start": 92, "end": 115, "url": "https://t.co/NY6CGB7WtB", "expanded_url": "https://twitter.com/sparkpool_eth/status/1395662836840288261/photo/1", "display_url": "pic.twitter.com/NY6CGB7WtB", "media_key": "3_1395662829345132544"}]
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
					"urls": [{"start": 126, "end": 149, "url": "https://t.co/05VGyxiyK8", "expanded_url": "https://twitter.com/MicrowaveDev/status/1296972062662234112", "display_url": "twitter.com/MicrowaveDev/s…"}]
				}
			},
			{
				"entities": {
					"hashtags": [{"start": 211, "end": 220, "tag": "Ethereum"}, {"start": 221,"end": 230,"tag": "proptech"}, {"start": 231, "end": 235, "tag": "DAO"}],
					"mentions": [
						{"start": 29, "end": 41, "username": "galtproject", "id": "1041654490523287552"},
						{"start": 46, "end": 56, "username": "xdaichain", "id": "1448922864380416006"},
						{"start": 182,"end": 192,"username": "xdaichain","id": "1448922864380416006"}
					],
					"urls": [
						{"start": 236, "end": 259, "url": "https://t.co/toAO8u2UR2", "expanded_url": "https://twitter.com/galtproject/status/1296887930074607616/photo/1", "display_url": "pic.twitter.com/toAO8u2UR2", "media_key": "3_1296887923065917441"},
						{"start": 236, "end": 259, "url": "https://t.co/toAO8u2UR2", "expanded_url": "https://twitter.com/galtproject/status/1296887930074607616/photo/1", "display_url": "pic.twitter.com/toAO8u2UR2", "media_key": "3_1296887923045011458"}
					]
				},
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
					"hashtags": [{"start": 93, "end": 102, "tag": "ethereum"}, {"start": 103, "end": 112, "tag": "solidity"}, {"start": 113, "end": 128, "tag": "smartcontracts"}, {"start": 129, "end": 140, "tag": "blockchain"}],
					"mentions": [{"start": 24, "end": 34, "username": "jony_bang", "id": "1500113611108196356"}],
					"urls": [{"start": 69, "end": 92, "url": "https://t.co/przCAVYNNe", "expanded_url": "https://medium.com/coinmonks/how-to-optimize-eth-smart-contract-size-part-1-a393f444a1df", "display_url": "medium.com/coinmonks/how-…"}]
				},
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
					"annotations": [{"start": 11, "end": 21, "probability": 0.3696, "type": "Product", "normalized_text": "Google maps"}],
					"urls": [
						{"start": 267, "end": 290, "url": "https://t.co/MNwZoHsqcY", "expanded_url": "https://twitter.com/jony_bang/status/1228369054949396482/photo/1", "display_url": "pic.twitter.com/MNwZoHsqcY", "media_key": "3_1228369041208811520"},
						{"start": 267, "end": 290, "url": "https://t.co/MNwZoHsqcY", "expanded_url": "https://twitter.com/jony_bang/status/1228369054949396482/photo/1", "display_url": "pic.twitter.com/MNwZoHsqcY", "media_key": "3_1228369048309768198"}
					]
				},
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
					"hashtags": [{"start": 229, "end": 238, "tag": "ethereum"}, {"start": 239, "end": 243, "tag": "dao"}, {"start": 244, "end": 249, "tag": "web3"}, {"start": 250, "end": 256, "tag": "DApps"}, {"start": 257, "end": 261, "tag": "ETH"}, {"start": 262, "end": 271, "tag": "PropTech"}],
					"urls": [
						{"start": 91, "end": 114, "url": "https://t.co/1y7g8B7tMN", "expanded_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6", "display_url": "medium.com/galtproject/ga…", "status": 200, "unwound_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6"},
						{"start": 131, "end": 154, "url": "https://t.co/Ey9CKYSBph", "expanded_url": "http://app.galtproject.io", "display_url": "app.galtproject.io", "unwound_url": "http://app.galtproject.io"}
					]
				},
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
					"mentions": [{"start": 0, "end": 10, "username": "chebyster", "id": "197293842"}, {"start": 11, "end": 21, "username": "jony_bang", "id": "1500113611108196356"}]
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
					"urls": [{"start": 68, "end": 91, "url": "https://t.co/rd5WWeQiId", "expanded_url": "https://twitter.com/jony_bang/status/1124450838188052481/photo/1", "display_url": "pic.twitter.com/rd5WWeQiId", "media_key": "3_1124450638400716801"}]
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
					"urls": [
						{"start": 15, "end": 38, "url": "https://t.co/5CGtg47NMU", "expanded_url": "https://twitter.com/jony_bang/status/1123932977195515904/photo/1", "display_url": "pic.twitter.com/5CGtg47NMU", "media_key": "3_1123932947881582594"},
						{"start": 15, "end": 38, "url": "https://t.co/5CGtg47NMU", "expanded_url": "https://twitter.com/jony_bang/status/1123932977195515904/photo/1", "display_url": "pic.twitter.com/5CGtg47NMU", "media_key": "3_1123932965329952770"}
					]
				}
			},
			{
				"entities": {
					"hashtags": [{"start": 11, "end": 15, "tag": "bjd"}, {"start": 16, "end": 32, "tag": "balljointeddoll"}, {"start": 33, "end": 38, "tag": "doll"}, {"start": 39, "end": 46, "tag": "zombie"}, {"start": 47, "end": 57, "tag": "fairyland"}],
					"urls": [{"start": 58, "end": 81, "url": "https://t.co/042cUgItDi", "expanded_url": "https://twitter.com/zeligenm/status/1117795803005845504/photo/1", "display_url": "pic.twitter.com/042cUgItDi", "media_key": "3_1117795791274500102"}]
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
			{"media_key": "3_1317238234095779846", "type": "photo", "url": "https://pbs.twimg.com/media/EkfFMePXgAYd1zm.jpg"},
			{"media_key": "3_1317238236327063553", "type": "photo", "url": "https://pbs.twimg.com/media/EkfFMmjWMAEpGZ0.jpg"},
			{"media_key": "3_1289679911796576258", "type": "photo", "url": "https://pbs.twimg.com/media/EeXdC_iXkAISk6X.jpg"},
			{"media_key": "3_1228370112291524609", "type": "photo", "url": "https://pbs.twimg.com/media/EQwMG-PX0AEw1hX.jpg"},
			{"media_key": "3_1228370120042569728", "type": "photo", "url": "https://pbs.twimg.com/media/EQwMHbHXYAA3SP5.jpg"},
			{"media_key": "3_1228369041208811520", "type": "photo", "url": "https://pbs.twimg.com/media/EQwLIoJWoAANMJC.jpg"},
			{"media_key": "3_1228369048309768198", "type": "photo", "url": "https://pbs.twimg.com/media/EQwLJCmWoAY37Ji.jpg"},
			{"media_key": "3_1218102715173220354", "type": "photo", "url": "https://pbs.twimg.com/media/EOeR9zXWsAIzjf2.jpg"},
			{"media_key": "3_1182615617603604480", "type": "photo", "url": "https://pbs.twimg.com/media/EGl-o3EXkAATDov.jpg"},
			{"media_key": "3_1126597347973242889", "type": "photo", "url": "https://pbs.twimg.com/media/D6J6UarXoAkspq4.jpg"},
			{"media_key": "3_1124451483641106432", "type": "photo", "url": "https://pbs.twimg.com/media/D5raqrGW0AAvDai.jpg"},
			{"media_key": "3_1124450638400716801", "type": "photo", "url": "https://pbs.twimg.com/media/D5rZ5eVWAAEWB7C.jpg"},
			{"media_key": "3_1123933187758088195", "type": "photo", "url": "https://pbs.twimg.com/media/D5kDR4eX4AMZGj5.jpg"},
			{"media_key": "3_1123932947881582594", "type": "photo", "url": "https://pbs.twimg.com/media/D5kDD63W4AIzg04.jpg"},
			{"media_key": "3_1123932965329952770", "type": "photo", "url": "https://pbs.twimg.com/media/D5kDE73X4AIaID2.jpg"},
			{"media_key": "3_1117942294227881984", "type": "photo", "url": "https://pbs.twimg.com/media/D4O6l-7WkAAtD_H.jpg"}
		]
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

		let message = {
			"attachments": {"media_keys": ["3_1289679911796576258"]},
			"created_at": "2020-08-01T21:50:27.000Z",
			"reply_settings": "everyone",
			"source": "Twitter for Android",
			"entities": {
				"urls": [{"start": 114, "end": 137, "url": "https://t.co/UUvfhl88b2", "expanded_url": "https://twitter.com/jony_bang/status/1289679914124247040/photo/1", "display_url": "pic.twitter.com/UUvfhl88b2", "media_key": "3_1289679911796576258"}],
				"mentions": [{"start": 15, "end": 27, "username": "fontawesome", "id": "515543735"}]
			},
			"conversation_id": "1289679914124247040",
			"possibly_sensitive": false,
			"author_id": "3142378517",
			"text": "It's not cool, @fontawesome why did you spam several messages in a day to me? I should have unsubscribed long ago https://t.co/UUvfhl88b2",
			"lang": "en",
			"id": "1289679914124247040"
		};

		const channel = await twitterClient.storeChannelToDb(testUser.id, null, includes.users.filter(u => u.id === message.author_id)[0]);

		const messages = twitterHelpers.parseTweetsData({_realData: {
			includes,
			data: [message],
			meta: {}
		}});

		const advancedSettings = {mergeSeconds: 5};
		const twImportClient = new TwitterImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		twImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;

		await socNetImport.importChannelPosts(twImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(channel.groupId, {}, {});

		assert.equal(groupPosts.length, 1);
		const postContents = await app.ms.group.getPostContentDataWithUrl(groupPosts[0], 'https://my.site/ipfs/');
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
		assert.equal(imageC.url, 'https://my.site/ipfs/bafkreienzjj6jklshwjjseei4ucfm62tuqcvzbwcyspfwaks2r7nuweoly');
		assert.equal(imageC.manifestId, 'bafyreiagvoan5sb3zjorhvzw3qiq4o23hn5oi3dnryequknxsafjzjcb6y');
	});

	it('webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];

		const message = {
			"author_id": "3142378517",
			"created_at": "2021-05-21T22:39:35.000Z",
			"possibly_sensitive": false,
			"lang": "en",
			"source": "Twitter for Android",
			"entities": {"mentions": [{"start": 0, "end": 14, "username": "sparkpool_eth", "id": "955345726858452992"}]},
			"referenced_tweets": [{"type": "replied_to", "id": "1395662836840288261"}],
			"reply_settings": "everyone",
			"in_reply_to_user_id": "955345726858452992",
			"conversation_id": "1395662646951641090",
			"text": "@sparkpool_eth Can you please share the link of this page?",
			"id": "1395871923561803781"
		};

		const channel = await twitterClient.storeChannelToDb(testUser.id, null, includes.users.filter(u => u.id === message.author_id)[0]);

		const messages = twitterHelpers.parseTweetsData({_realData: {
			includes,
			data: [message],
			meta: {}
		}});

		const advancedSettings = {mergeSeconds: 5};
		const twImportClient = new TwitterImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		twImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;

		await socNetImport.importChannelPosts(twImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(channel.groupId, {}, {});
		assert.equal(groupPosts.length, 1);

		const postDataBySourceId = {
			'1395871923561803781': {groupedMsgIds: undefined, replyToMsgId: '1395662836840288261', contents: ['Can you please share the link of this page?'], repostContents: []},
		};
		await pIteration.mapSeries(groupPosts, async (gp: IPost) => {
			const postContents = await app.ms.group.getPostContentDataWithUrl(gp, 'https://my.site/ipfs/');
			const repostContents = gp.repostOf ? await app.ms.group.getPostContentDataWithUrl(gp.repostOf, 'https://my.site/ipfs/') : [];
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text || rc.url), 'repostContents', repostContents.map(rc => rc.text || rc.url));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, postDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.equal(JSON.parse(gp.propertiesJson).repostOfMsgId, postDataBySourceId[gp.sourcePostId].repostOfMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, postDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].contents);
			assert.deepEqual(repostContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].repostContents);
		})

		const postContents = await app.ms.group.getPostContentDataWithUrl(groupPosts[0], 'https://my.site/ipfs/');
		assert.equal(postContents.length, 1);
		const [messageC] = postContents;

		assert.equal(messageC.text, "Can you please share the link of this page?");
		assert.equal(messageC.manifestId, 'bafyreiazgkzyg2skgvj7cuympxptjjqhjyth25wfpzftylj7wflxcgg6qe');

		const replyToChannel = await socNetImport.getDbChannel(testUser.id, {accountId: message.in_reply_to_user_id});

		const {list: replyPosts} = await app.ms.group.getGroupPosts(replyToChannel.groupId, {}, {});
		assert.equal(replyPosts.length, 1);

		const replyDataBySourceId = {
			'1395662836840288261': {groupedMsgIds: undefined, replyToMsgId: undefined, contents: ['2/ ETH1 pow lauched on 2015-07-30. After about 6 years, Top5 mining pools have 64.1% share.', 'https://my.site/ipfs/bafkreienzjj6jklshwjjseei4ucfm62tuqcvzbwcyspfwaks2r7nuweoly'], repostContents: []},
		};
		await pIteration.mapSeries(replyPosts, async (gp: IPost) => {
			const postContents = await app.ms.group.getPostContentDataWithUrl(gp, 'https://my.site/ipfs/');
			const repostContents = gp.repostOf ? await app.ms.group.getPostContentDataWithUrl(gp.repostOf, 'https://my.site/ipfs/') : [];
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text || rc.url), 'repostContents', repostContents.map(rc => rc.text || rc.url));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, replyDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.equal(JSON.parse(gp.propertiesJson).repostOfMsgId, replyDataBySourceId[gp.sourcePostId].repostOfMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, replyDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text || rc.url), replyDataBySourceId[gp.sourcePostId].contents);
			assert.deepEqual(repostContents.map(rc => rc.text || rc.url), replyDataBySourceId[gp.sourcePostId].repostContents);
		});
	});

	it('local webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];

		const message = {
			"author_id": "3142378517",
			"created_at": "2020-01-15T11:25:24.000Z",
			"possibly_sensitive": false,
			"lang": "en",
			"source": "Twitter for Android",
			"entities": {
				"mentions": [{"start": 3, "end": 15, "username": "galtproject", "id": "1041654490523287552"}],
				"urls": [{"start": 108, "end": 131, "url": "https://t.co/1y7g8B7tMN", "expanded_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6", "display_url": "medium.com/galtproject/ga…", "status": 200, "unwound_url": "https://medium.com/galtproject/galt-project-live-on-ethereum-mainnet-athens-release-ca11087828f6"}]
			},
			"referenced_tweets": [{"type": "retweeted", "id": "1217406911303372800"}],
			"reply_settings": "everyone",
			"conversation_id": "1217407431157960704",
			"text": "RT @galtproject: Hey everyone! 🎊 Amazing news! Galt•Project is live on Ethereum mainnet. More details here: https://t.co/1y7g8B7tMN.  DApp…",
			"id": "1217407431157960704"
		};

		const channel = await twitterClient.storeChannelToDb(testUser.id, null, includes.users.filter(u => u.id === message.author_id)[0]);

		const messages = twitterHelpers.parseTweetsData({_realData: {
			includes,
			data: [message],
			meta: {}
		}});

		const advancedSettings = {mergeSeconds: 5};
		const twImportClient = new TwitterImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		twImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;

		await socNetImport.importChannelPosts(twImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(channel.groupId, {}, {});
		assert.equal(groupPosts.length, 1);

		const replyDataBySourceId = {
			'1217407431157960704': {groupedMsgIds: undefined, repostOfMsgId: "1217406911303372800", contents: [], repostContents: ['Hey everyone! 🎊 Amazing news! Galt•Project is live on Ethereum mainnet. More details here: https://t.co/1y7g8B7tMN.  DApp is here: https://t.co/Ey9CKYSBph Put your land, house or apartment on Ethereum! Create community and Vote! #ethereum #dao #web3 #DApps #ETH #PropTech']},
		};
		await pIteration.mapSeries(groupPosts, async (gp: IPost) => {
			const postContents = await app.ms.group.getPostContentDataWithUrl(gp, 'https://my.site/ipfs/');
			const repostContents = gp.repostOf ? await app.ms.group.getPostContentDataWithUrl(gp.repostOf, 'https://my.site/ipfs/') : [];
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text || rc.url), 'repostContents', repostContents.map(rc => rc.text || rc.url));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, replyDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.equal(JSON.parse(gp.propertiesJson).repostOfMsgId, replyDataBySourceId[gp.sourcePostId].repostOfMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, replyDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text || rc.url), replyDataBySourceId[gp.sourcePostId].contents);
			assert.deepEqual(repostContents.map(rc => rc.text || rc.url), replyDataBySourceId[gp.sourcePostId].repostContents);
		});
	});

	it('test localIds', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const authorId = "3142378517";
		const channel = await twitterClient.storeChannelToDb(testUser.id, null, includes.users.filter(u => u.id === authorId)[0]);

		function getMessages(offset, length) {
			return Array.from({length}, (_, i) => ({
				"author_id": authorId,
				"created_at": "2020-01-15T11:" + (20 + offset - i) + ":24.000Z",
				"possibly_sensitive": false,
				"lang": "en",
				"source": "Twitter for Android",
				"reply_settings": "everyone",
				"text": (offset + length - i).toString(),
				"id": "1217407431157960704" + i
			}));
		}
		const advancedSettings = {mergeSeconds: 5, isReversedList: true};
		const length = 10;
		const messagesList = getMessages(0, length);
		const texts = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
		for(let i = 0; i < messagesList.length; i++) {
			assert.equal(messagesList[i].text, texts[i].toString());
		}
		const messages = twitterHelpers.parseTweetsData({_realData: { includes, data: messagesList, meta: {}}});

		await twitterClient.importMessagesList(testUser.id, {account: {}}, channel, messages, advancedSettings);
		await socNetImport.reversePostsLocalIds(testUser.id, channel.id);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(channel.groupId, {}, {sortBy: 'publishedAt', sortDir: 'asc'});
		assert.equal(groupPosts.length, 10);

		await pIteration.mapSeries(groupPosts, async (gp: IPost, i) => {
			const postContents = await app.ms.group.getPostContentDataWithUrl(gp, 'https://my.site/ipfs/');
			assert.equal(postContents.length, 1);
			assert.equal(postContents[0].text, (i + 1).toString());
			assert.equal(gp.localId, i + 1);
		});

		const lastMessageToReverse = await socNetImport.getDbChannelStartReverseMessage(channel.id);
		assert.equal(lastMessageToReverse, null);
	});
});