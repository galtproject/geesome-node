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
import IGeesomeTelegramClient from "../app/modules/telegramClient/interface";
import IGeesomeSocNetImport from "../app/modules/socNetImport/interface";
import IGeesomeSocNetAccount from "../app/modules/socNetAccount/interface";
import {TelegramImportClient} from "../app/modules/telegramClient/importClient";

const pIteration = require('p-iteration');
const clone = require('lodash/clone');

const telegramHelpers = require('../app/modules/telegramClient/helpers');

const assert = require('assert');
const helpers = require('../app/helpers');

describe("telegramClient", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, telegramClient: IGeesomeTelegramClient, socNetAccount: IGeesomeSocNetAccount,
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
			telegramClient = app.ms['telegramClient'];
			socNetImport = app.ms['socNetImport'];
			socNetAccount = app.ms['socNetAccount'];
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
		let count = 0;

		telegramClient['downloadMediaByClient'] = async (client, media) => {
			const {file} = telegramHelpers.getMediaFileAndSize(media);
			if (!file) {
				return {client, result: null};
			}
			count++;
			return {
				result: {
					content: helpers.base64ToArrayBuffer(
						count > 1
							? 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAByFBMVEUgM1cgMlYgMlUeMVUcMFQiMFIhMFMgNFgdOWAcPGUdOWEfNFkhMVMiL1IhMVQgNFgZQm0YQGogNFghMVQfNVsTT4AfNlsgNFghMFMZQm0hMFMgNFggNFgdOmEfNVscO2MnOVwiN1s1RmcyQ2UjNlkkNloXK1BRYHxSYX0XK1AVKU8iNVgiNVkVKU8YLFEpO14pO14YLFEiNVlSYX0XK1AjNlo2R2dAUG82R2ckNloPV40IZ6QFb7AJZqMRUoYFbq8BeL0AeL4GaagrVn8ye6wST4EDc7YBd7wBd70Eba4hYpMmhb8Cc7cTT4EAdrwBdrsGbKwCdbkPWI4IaKUJZaIaP2kIaKYPVIkfUn9QXXgXVIYCdboKX5oGaqgBdboBdLgtQ2ZEV3a/w804V3wEa6sNW5M2TG4eTnoCcrUDcrUQVYoZUoIgU4ArTnWGkKSdpbX29/h9ip8TQ3FHYIDGydJse5MOUoYXUIBsepKssr6+wsyrsb+XoLD8/f3////T1t1baYPAxc/S1t1EVnV2g5nu7/KbpLTj5ur+/v7v8PP9/v79/f7S1d3s7fDk5up9iJ3z9Pb09fd+iZ7k5uuaorPO0trl5+uao7MtbbI9AAAAOnRSTlMAAAAAAAdGntn12Z9HBxiM6emNGan+q45H6kifodv2+Pb42tygokjq60oHjpAIGaytGo/qSaLc+d2j9tPZtgAAAAFvck5UAc+id5oAAAD+SURBVBjTY2BgYGRlY+fg5OTi5uFlZAACJj5+AStrGxtbO0EhYSagPJ+IqL2Dg4Ojk7OLq5gwIwMrv6ibg7u7u4enl7ePrzgrg4SAvaM7GPj5OdhLSjFIW/kHBLpDgUOQDANHcEhoiIO7gwNYIEyWQS48IjLKPzom1sHdPy7eSZ5BISExKTklNS09IzMrOydXkUEpL7+gsKi4pLSsvKKyqlqZQaWmtq6+obGuqbmlta6uTZVBTb29rqOzq667p7eurk9Dk0FLu39CHRRMnKSjy8Csp9/fDuFPnmRgyMzAwKJnZDxl6rRpU6dr6BiygLzLrGViamZubmGpqQuUBwD7mkc7yNTEawAAAABJRU5ErkJggg=='
							: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABR1BMVEUAAAAgM1cgM1cgM1cgNFggNFggM1cgM1cgM1cgM1ccO2MgM1cgM1cgM1cgM1cgM1cgM1ccPGQgM1cgM1cgM1cfNFkgM1cgM1cgM1c8TGw9Tm0gM1cgM1cgM1cgM1cgM1cgM1cgM1c9TW0+Tm0gM1cgM1clOFsPWY8Fba0BdrsFba4UTX0CdLgBd7wGbKspRGk2ir4UTX4DcrQbVoYmicQFbq8OWpAHaacfNFkHaqkOW5IXR3VWZH8TUIILYZsFbq4Bd7suQWMvQmTp6u4lPWIDdLcNXZYwQ2QZQ28SUoUXRnQeOmGnrryLlaf///94g5kWSXg3SWrk5utgbYcPWI8WSnlmc4y0usfGy9TS1t2dprXl5+wzRWYsPmBve5P8/PygqLf39/n9/f7W2eD5+fr3+Pl3gph5hJp3g5n4+Pnj5er+/v6gqLjJuAnyAAAAJ3RSTlMALJLU9PXVky0H/ZUIvL2Ulv0u1/X4+NbY/f4wl5m/wAmY/f4v2flxXoaXAAAAAW9yTlQBz6J3mgAAANdJREFUGNNjYAACRiZmFlY2dg4GCOBk51LX0NTUUufi5gHzebV1dIFAT9/AkA8kwq+tCwZGxia6hgJA/Vw6unCgIyjEwK6ua4oQMeNmYNMyt7CEC5gKM4hYWdvY6ura2YMFHEQZRBydnF1c3dw9NDU9tb28xRjEfXz9/AMCg4JDQsPCIyIlGPij/PyiYyL9omPj4v38EgQYhCQT/fyS/Pz8klP8/FKlpBkYZNL84CBdFuhSHrmMVAg3M11eAeQZHkWlhKzs7KwcZVkFqH9VBFTV1FRlpEFsANI2LfvWO/vxAAAAAElFTkSuQmCC'),
					mimeType: 'image/jpg'
				}
			} as any;
		};
	});

	afterEach(async () => {
		await app.stop();
	});

	it('entities and line breaks should handle correctly', async () => {
		const m = {
			id: 5,
			replyTo: null,
			date: 1647614599,
			message: 'Text\n' + '\n' + 'Text after 2 br\n' + 'Link\n' + 'www.google.com\n' + 'Spoiler\n' + 'Strike\n' + 'Bold\n' + 'Italian\n' + 'Underline\n' + 'Code',
			entities: [
				{CONSTRUCTOR_ID: 1990644519, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityTextUrl', classType: 'constructor', offset: 22,length: 5,url: 'https://www.google.com/'},
				{CONSTRUCTOR_ID: 1859134776, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityUrl', classType: 'constructor', offset: 27, length: 14},
				{CONSTRUCTOR_ID: 852137487, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntitySpoiler', classType: 'constructor', offset: 42, length: 8},
				{CONSTRUCTOR_ID: 3204879316, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityStrike', classType: 'constructor', offset: 50, length: 7},
				{CONSTRUCTOR_ID: 3177253833, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityBold', classType: 'constructor', offset: 57, length: 5},
				{CONSTRUCTOR_ID: 2188348256, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityItalic', classType: 'constructor', offset: 62, length: 8},
				{CONSTRUCTOR_ID: 2622389899, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityUnderline', classType: 'constructor', offset: 70, length: 10},
				{CONSTRUCTOR_ID: 681706865, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityCode', classType: 'constructor', offset: 80, length: 4}
			],
			media: null,
			action: undefined,
			groupedId: null
		};

		assert.equal(telegramHelpers.messageWithEntitiesToHtml(m.message, m.entities), 'Text<br><br>Text after 2 br<br><a href="https://www.google.com/">Link</a><br><a href="www.google.com">www.google.com</a><br><span class="spoiler">Spoiler</span><br><s>Strike</s><br><b>Bold</b><br><i>Italian</i><br><u>Underline</u><br><code>Code</code>');
	});

	it('webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message = {
			id: 47,
			replyTo: null,
			date: 1586786046,
			message: 'btw, а это тут было: https://vas3k.ru/blog/machine_learning/?',
			entities: [{CONSTRUCTOR_ID: 1859134776, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityUrl', classType: 'constructor', offset: 21, length: 39}],
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
					flags: 287,
					id: 445363241646479564,
					url: 'https://vas3k.ru/blog/machine_learning/',
					displayUrl: 'vas3k.ru/blog/machine_learning',
					hash: 0,
					type: 'photo',
					siteName: 'vas3k.ru',
					title: 'Машинное обучение для людей',
					description: 'Разбираемся простыми словами',
					photo: {
						CONSTRUCTOR_ID: 4212750949,
						SUBCLASS_OF_ID: 3581324060,
						className: 'Photo',
						classType: 'constructor',
						flags: 0,
						hasStickers: false,
						id: 5954915217978796261,
						accessHash: 439149036367074527,
						fileReference: Buffer.from([/*00 62 6a 96 ff 65 28 83 5a 0b 0e a1 7b 61 44 39 a7 70 fb f6 70*/]),
						date: 1549035239,
						sizes: [{CONSTRUCTOR_ID: 3769678894, SUBCLASS_OF_ID: 399256025, className: 'PhotoStrippedSize', classType: 'constructor', type: 'i', bytes: Buffer.from([/*01 14 28 d8 3f a5 27 3d ba 7b 9a 0e 3d 4d 2f e3 40 07 38 a4 e7 23 d2 97 b7 5a 4c 1f 6a 00 07 e3 45 00 f3 d2 8a 00 76 01 a3 14 51 40 06 28 c0 14 51 40 ... 6 more bytes*/])}, {CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'm', w: 320, h: 163, size: 12107},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'x', w: 800, h: 408, size: 45932},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'y', w: 900, h: 459, size: 50629}],
						videoSizes: null,
						dcId: 4
					},
					embedUrl: null,
					embedType: null,
					embedWidth: null,
					embedHeight: null,
					duration: null,
					author: 'https://vas3k.ru',
					document: null,
					cachedPage: null,
					attributes: null
				}
			},
			action: undefined,
			groupedId: null
		};

		const {file, fileSize, mimeType, thumbSize} = telegramHelpers.getMediaFileAndSize(message.media);
		assert.equal(file.id, 5954915217978796000);
		assert.equal(file.accessHash, 439149036367074500);
		assert.equal(fileSize, 50629);
		assert.equal(mimeType, 'image/jpg');
		assert.equal(thumbSize, 'y');

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: [message]}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: [message].filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 1);

		const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', groupPosts[0]);
		assert.equal(postContents.length, 3);
		const [messageC, imageC, linkC] = postContents;

		assert.equal(imageC.type, 'image');
		assert.equal(imageC.mimeType, 'image/jpg');
		assert.equal(imageC.view, 'media');
		assert.equal(imageC.url, 'https://my.site/ipfs/bafkreienzjj6jklshwjjseei4ucfm62tuqcvzbwcyspfwaks2r7nuweoly');
		assert.equal(imageC.manifestId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');

		assert.equal(linkC.type, 'json');
		assert.equal(linkC.mimeType, 'application/json');
		assert.equal(linkC.view, 'link');
		assert.deepEqual(linkC.json, {
			description: 'Разбираемся простыми словами',
			displayUrl: 'vas3k.ru/blog/machine_learning',
			siteName: 'vas3k.ru',
			title: 'Машинное обучение для людей',
			type: 'url',
			url: 'https://vas3k.ru/blog/machine_learning/'
		});
		assert.equal(linkC.manifestId, 'bafyreigrlqgzid43vgdjsq3r3beazr7mivb3fpq4qv3famn3b6wcqvulca');

		assert.equal(messageC.type, 'text');
		assert.equal(messageC.mimeType, 'text/html');
		assert.equal(messageC.view, 'contents');
		assert.equal(messageC.text, 'btw, а это тут было: <a href="https://vas3k.ru/blog/machine_learning/">https://vas3k.ru/blog/machine_learning/</a>?');
		assert.equal(messageC.manifestId, 'bafyreifbyileppejprgcv4yvmvgotsp7xzckneaiz3hgmkfjot3zss4g34');
	});

	it('local webpage message should import properly', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message = {
			id: 1247,
			replyTo: null,
			date: 1651067259,
			message: 'https://t.me/inside_microwave/161',
			entities: [{CONSTRUCTOR_ID: 1859134776, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityUrl', classType: 'constructor', offset: 0, length: 33}],
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

		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: [message]}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: [message].filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 1);
		const {contents} = groupPosts[0];

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
			entities: [{CONSTRUCTOR_ID: 1990644519, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityTextUrl', classType: 'constructor', offset: 0, length: 18, url: 'https://t.me/ctodailychat/267937'}],
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
			entities: [{CONSTRUCTOR_ID: 1859134776, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityUrl', classType: 'constructor', offset: 0, length: 58}],
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
					sizes: [{CONSTRUCTOR_ID: 3769678894, SUBCLASS_OF_ID: 399256025, className: 'PhotoStrippedSize', classType: 'constructor', type: 'i', bytes: Buffer.from([/*01 1b 28 ba e2 7f b7 a1 50 e6 3c 73 f3 7c a3 f0 ab 18 93 1f 78 fe 63 fc 29 18 90 fc 67 f3 14 87 3e ad d3 fb c2 80 25 5c e3 9a 5a 88 96 e7 19 f6 f9 85 ... 65 more bytes*/])}, {CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'm', w: 320, h: 212, size: 18298}, {CONSTRUCTOR_ID: 4198431637, SUBCLASS_OF_ID: 399256025, className: 'PhotoSizeProgressive', classType: 'constructor', type: 'x', w: 750, h: 496, sizes: [3341, 9007, 17892, 25486, 39802]}],
					videoSizes: null,
					dcId: 2
				},
				ttlSeconds: null
			},
			action: undefined,
			groupedId: null
		};

		const message3 = clone(message1);
		message3.id -= 1;
		message3.date -= 10;

		const message4 = clone(message1);
		message3.id -= 2;
		message4.date += 9;

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: [message1, message2, message3, message4]}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: [message1, message2, message3, message4].filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		// assert.equal(groupPosts.length, 1);
		const {contents} = groupPosts[0];
		// for (let i = 0; i < contents.length; i++) {
		// 	console.log(i, await app.ms.storage.getFileDataText(contents[i].storageId));
		// }
		assert.equal(contents[0].manifestStorageId, 'bafyreic4hvcncqyg7s52yc2vhl7nqygx2iyw5act57zc3yt72xtc4wemga');
		assert.equal(contents[1].manifestStorageId, 'bafyreihjglmtrd6tqyyqqqwwg67ljpy3z4hfenvakuylj5vyn7hbrfqei4');
		assert.equal(contents[2].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');
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
				entities: [{CONSTRUCTOR_ID: 1990644519, SUBCLASS_OF_ID: 3479443932, className: 'MessageEntityTextUrl', classType: 'constructor', offset: 0, length: 18, url: 'https://t.me/ctodailychat/263223'}],
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
						sizes: [{CONSTRUCTOR_ID: 3769678894,SUBCLASS_OF_ID: 399256025,className: 'PhotoStrippedSize',classType: 'constructor',type: 'i',bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/])}, {CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'm', w: 148, h: 320, size: 9356}, {CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'x', w: 369, h: 800, size: 33650}, {CONSTRUCTOR_ID: 4198431637, SUBCLASS_OF_ID: 399256025, className: 'PhotoSizeProgressive', classType: 'constructor', type: 'y', w: 591, h: 1280, sizes: [5161, 12582, 23194, 30735, 46885]}],
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
						sizes: [{CONSTRUCTOR_ID: 3769678894, SUBCLASS_OF_ID: 399256025, className: 'PhotoStrippedSize', classType: 'constructor', type: 'i', bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/])},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'm', w: 148, h: 320, size: 9356},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'x', w: 369, h: 800, size: 33650},{CONSTRUCTOR_ID: 4198431637, SUBCLASS_OF_ID: 399256025, className: 'PhotoSizeProgressive', classType: 'constructor', type: 'y', w: 591, h: 1280, sizes: [5161, 12582, 23194, 30735, 46885]}],
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
				entities: [{CONSTRUCTOR_ID: 1990644519,SUBCLASS_OF_ID: 3479443932,className: 'MessageEntityTextUrl',classType: 'constructor',offset: 0,length: 18,url: 'https://t.me/ctodailychat/263251'}],
				media: null,
				action: undefined,
				groupedId: null
			},
			{
				id: 1213,
				replyTo: null,
				date: 1649064970,
				message: 'https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html',
				entities: [{CONSTRUCTOR_ID: 1859134776,SUBCLASS_OF_ID: 3479443932,className: 'MessageEntityUrl',classType: 'constructor',offset: 0,length: 81}],
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


		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: messages}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: messages.filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

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
					sizes: [{CONSTRUCTOR_ID: 3769678894, SUBCLASS_OF_ID: 399256025, className: 'PhotoStrippedSize', classType: 'constructor', type: 'i', bytes: Buffer.from([/*01 28 13 d3 a2 99 21 f9 70 06 4d 45 1c ac 25 d9 20 03 3c 71 93 53 62 0b 14 51 45 02 2a ca 92 99 c9 57 c0 e3 03 f2 a6 4b 11 92 5d f9 e8 7a 72 6a 7b 89 ... 51 more bytes*/])},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'm', w: 148, h: 320, size: 10621},{CONSTRUCTOR_ID: 1976012384, SUBCLASS_OF_ID: 399256025, className: 'PhotoSize', classType: 'constructor', type: 'x', w: 369, h: 800, size: 40330},{CONSTRUCTOR_ID: 4198431637, SUBCLASS_OF_ID: 399256025, className: 'PhotoSizeProgressive', classType: 'constructor', type: 'y', w: 591, h: 1280, sizes: [5923, 15115, 28050, 38041, 59580]}],
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
					sizes: [{CONSTRUCTOR_ID: 3769678894,SUBCLASS_OF_ID: 399256025,className: 'PhotoStrippedSize',classType: 'constructor',type: 'i',bytes: Buffer.from([/*01 28 13 d3 a2 9b 21 01 79 e8 48 1d 71 48 8c 09 23 9c 8e bc d4 91 61 f4 51 45 02 2b 5d a1 94 28 18 6d a7 25 4f 43 51 43 03 45 2a 3e ee 06 49 03 3c 75 ... 52 more bytes*/])},{CONSTRUCTOR_ID: 1976012384,SUBCLASS_OF_ID: 399256025,className: 'PhotoSize',classType: 'constructor',type: 'm',w: 148,h: 320,size: 9356},{CONSTRUCTOR_ID: 1976012384,SUBCLASS_OF_ID: 399256025,className: 'PhotoSize',classType: 'constructor',type: 'x',w: 369,h: 800,size: 33650},{CONSTRUCTOR_ID: 4198431637, SUBCLASS_OF_ID: 399256025, className: 'PhotoSizeProgressive', classType: 'constructor',type: 'y',w: 591,h: 1280,sizes: [5161, 12582, 23194, 30735, 46885]}],
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

		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: [message1, message2]}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: [message1, message2].filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 1);
		const contents1 = groupPosts[0].contents;
		assert.equal(contents1.length, 3);
		assert.equal(contents1[0].manifestStorageId, 'bafyreihrydk7t5w3vxixxzyqmkeyz6bw3kvqvhux2llfigu5js4nzg5rmm');
		assert.equal(contents1[1].manifestStorageId, 'bafyreiarrzvojk2eqsvgmmkc77fong6cnef57r25wvdvums44vgiy5ptre');
		assert.equal(contents1[2].manifestStorageId, 'bafyreifoksuhwlkn73jgzcbluzwvf3g62cpbuki6igalddkmgoexwcy3pm');
	});

	it.skip('should get reply info from anonymous forward', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const message1 = {
			"id": 12,
			"replyTo": null,
			"fwdFrom": {
				"flags": 32,
				"imported": false,
				"fromId": null,
				"fromName": "X ✰",
				"date": 1661713612,
				"channelPost": null,
				"postAuthor": null,
				"savedFromPeer": null,
				"savedFromMsgId": null,
				"psaType": null
			},
			"date": 1661781574,
			"message": "у меня ваще половина чатов так выглядит (но это у меня аккаунт сломан)",
			"groupedId": null,
			"media": {
				"flags": 1,
				"photo": {
					"flags": 0,
					"hasStickers": false,
					"id": "5215629871777169243",
					"accessHash": "1240871343489722844",
					"fileReference": Buffer.from([/*02 50 ef 70 e0 00 00 04 bb 62 6c c1 0d 7e 15 5b e1 09 68 33 c1 05 20 a6 82 6e fe 3d 23*/]),
					"date": 1661713590,
					"sizes": [{"type": "i","bytes": Buffer.from([/*02 50 ef 70 e0 00 00 04 bb 62 6c c1 0d 7e 15 5b e1 09 68 33 c1 05 20 a6 82 6e fe 3d 23*/]),}, {"type": "m", "w": 320, "h": 162, "size": 5747}, {"type": "x","w": 733,"h": 372,"sizes": [1972, 13362, 16260]}],
					"dcId": 2
				},
			},
		};

		const message2 = {
			"id": 13,
			"replyTo": {"flags": 0, "replyToMsgId": 12, "replyToPeerId": null, "replyToTopId": null},
			"fwdFrom": {
				"flags": 32,
				"imported": false,
				"fromId": null,
				"fromName": "X ✰",
				"date": 1661713916,
				"channelPost": null,
				"postAuthor": null,
				"savedFromPeer": null,
				"savedFromMsgId": null,
				"psaType": null
			},
			"date": 1661781584,
			"message": "виш",
			"entities": null,
			"media": null,
			"groupedId": null
		};

		console.log('createDbChannel');
		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const advancedSettings = {mergeSeconds: 5};
		console.log('TelegramImportClient');
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, {list: [message1, message2]}, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: [message1, message2].filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		console.log('importChannelPosts');
		await socNetImport.importChannelPosts(tgImportClient);

		console.log('getGroupPosts');
		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 2);
		const contents1 = groupPosts[0].contents;
		const contents2 = groupPosts[1].contents;
		assert.equal(contents1.length, 2);
		assert.equal(await app.ms.storage.getFileDataText(contents1[0].storageId), 'у меня ваще половина чатов так выглядит (но это у меня аккаунт сломан)');
		assert.equal(contents1[1].mimeType, 'image/jpg');
		assert.equal(contents2.length, 1);
		assert.equal(await app.ms.storage.getFileDataText(contents2[0].storageId), 'виш');
	});

	it('should get reply info from regular message forward', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const messages = {
			authorById: {"1234567890":{"flags":33555583,"self":true,"contact":false,"mutualContact":false,"deleted":false,"bot":false,"botChatHistory":false,"botNochats":false,"verified":false,"restricted":false,"min":false,"botInlineGeo":false,"support":false,"scam":false,"applyMinPhoto":true,"fake":false,"id":"1234567890","accessHash":"7758749997229638832","firstName":"Microwave","lastName":"Dev","username":"MicrowaveDev","phone":"79676974783","photo":{"flags":2,"hasVideo":false,"photoId":"5289617684247460167","strippedThumb":{"type":"Buffer","data":[1,8,8,120,158,6,64,161,142,214,99,198,223,74,40,162,137,59,9,179]},"dcId":2},"status":{"expires":1672235429},"botInfoVersion":null,"restrictionReason":null,"botInlinePlaceholder":null,"langCode":null}},
			list: [{
				"id":15,
				"replyTo":null,
				"fwdFrom": {
					"flags":1,
					"imported":false,
					"fromId":{"userId":"1234567890"},
					"fromName":null,
					"date":1672235097,
					"channelPost":null,
					"postAuthor":null,
					"savedFromPeer":null,
					"savedFromMsgId":null,
					"psaType":null
				},
				"date":1672235108,
				"message":"test",
				"entities":null,
				"media":null,
				"groupedId":null
			},{
				"id":16,
				"replyTo":{
					"flags":0,
					"replyToMsgId":15,
					"replyToPeerId":null,
					"replyToTopId":null
				},
				"fwdFrom":{
					"flags":1,
					"imported":false,
					"fromId":{"userId":"1234567890"},
					"fromName":null,
					"date":1672235101,
					"channelPost":null,
					"postAuthor":null,
					"savedFromPeer":null,
					"savedFromMsgId":null,
					"psaType":null
				},
				"date":1672235108,
				"message":"test reply",
				"entities":null,
				"media":null,
				"groupedId":null
			}]
		}

		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const advancedSettings = {mergeSeconds: 5};
		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: messages.list.filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 2);

		const postDataBySourceId = {
			15: {
				groupedMsgIds: undefined,
				repostOfMsgId: '1e229205b3f0812540f35726a178e196197c184e302ae2303f940f71db7e14c1',
				contents: [],
				repostContents: ['test']
			},
			16: {
				groupedMsgIds: undefined,
				replyToMsgId: 15,
				repostOfMsgId: 'd65384cd2d1f14acdb7cba1bb61ac684134e3813f7ce818ea8399c24dcb5eb50',
				contents: [],
				repostContents: ['test reply']
			},
		}
		await pIteration.mapSeries(groupPosts, async (gp) => {
			const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', gp);
			const repostContents = gp.repostOf ? await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', gp.repostOf) : [];
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text), 'repostContents', repostContents.map(rc => rc.text));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, postDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.equal(JSON.parse(gp.propertiesJson).repostOfMsgId, postDataBySourceId[gp.sourcePostId].repostOfMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, postDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].contents);
			assert.deepEqual(repostContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].repostContents);
		})
	});

	it('should get reply info from regular message', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const messages = {
			list: [
				{
					"id": 9,
					"replyTo": null,
					"fwdFrom": null,
					"date": 1671714854,
					"message": "test 1",
					"entities": null,
					"media": null,
					"groupedId": null
				},
				{
					"id": 10,
					"replyTo": null,
					"fwdFrom": null,
					"date": 1671714855,
					"message": "test 2",
					"entities": null,
					"media": null,
					"groupedId": null
				},
				{
					"id": 11,
					"replyTo": {"flags": 2, "replyToMsgId": 8, "replyToPeerId": null, "replyToTopId": 6},
					"fwdFrom": null,
					"date": 1671714860,
					"message": "test 3",
					"entities": null,
					"media": null,
					"groupedId": null
				},
				{
					"id": 12,
					"replyTo": null,
					"fwdFrom": null,
					"date": 1671714862,
					"message": "test 4",
					"entities": null,
					"media": null,
					"groupedId": null
				}
			],
		};
		const advancedSettings = {mergeSeconds: 5};
		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0
		});

		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async () => {
			return {result: {list: [{"id":8,"replyTo":null,"fwdFrom":null,"date":1671713854,"message":"test 0","entities":null,"media":null,"groupedId":null}]}} as any;
		};
		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 4);

		const postDataBySourceId = {
			8: {groupedMsgIds: undefined, contents: ['test 0']},
			10: {groupedMsgIds: ["9", "10"], contents: ['test 1', 'test 2']},
			11: {groupedMsgIds: undefined, contents: ['test 3'], replyToMsgId: 8},
			12: {groupedMsgIds: undefined, contents: ['test 4']}
		}
		await pIteration.mapSeries(groupPosts, async (gp) => {
			const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', gp);
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, postDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, postDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].contents);
		})
	});

	it('should get reply info from channel forward', async () => {
		const testUser = (await app.ms.database.getAllUserList('user'))[0];
		const testGroup = (await app.ms.group.getAllGroupList(admin.id, 'test').then(r => r.list))[0];

		const messages = {
			list: [
				{
					"id": 6,
					"replyTo": null,
					"fwdFrom": {
						"flags": 5,
						"imported": false,
						"fromId": {"channelId": "1197285959"},
						"fromName": null,
						"date": 1665757679,
						"channelPost": 2520,
						"postAuthor": null,
						"savedFromPeer": null,
						"savedFromMsgId": null,
						"psaType": null
					},
					"date": 1665757707,
					"message": "Repost from private channel",
					"entities": null,
					"media": null,
					"groupedId": null
				},
				{
					"id": 7,
					"replyTo": {"flags": 0, "replyToMsgId": 6, "replyToPeerId": null, "replyToTopId": null},
					"fwdFrom": {
						"flags": 5,
						"imported": false,
						"fromId": {"channelId": "1197285959"},
						"fromName": null,
						"date": 1665757701,
						"channelPost": 2521,
						"postAuthor": null,
						"savedFromPeer": null,
						"savedFromMsgId": null,
						"psaType": null
					},
					"date": 1665757707,
					"message": "Reply from private channel",
					"entities": null,
					"media": null,
					"groupedId": null
				},
				{
					"id": 8,
					"replyTo": {"flags": 2, "replyToMsgId": 7, "replyToPeerId": null, "replyToTopId": 6},
					"fwdFrom": null,
					"date": 1665757722,
					"message": "reply to reply",
					"entities": null,
					"media": null,
					"groupedId": null
				},
			],
			authorById: {"1197285959": {"flags": 24609, "creator": true, "left": false, "broadcast": true, "verified": false, "megagroup": false, "restricted": false, "signatures": false,	"min": false, "scam": false, "hasLink": false, "hasGeo": false, "slowmodeEnabled": false, "callActive": false, "callNotEmpty": false, "fake": false, "gigagroup": false, "noforwards": false, "id": "1197285959", "accessHash": "-3234143468344367843", "title": "Контент Микроволновки", "username": null, "photo": {}, "date": 1619725900, "restrictionReason": null, "adminRights": {"flags": 6847, "changeInfo": true, "postMessages": true, "editMessages": true, "deleteMessages": true, "banUsers": true, "inviteUsers": true, "pinMessages": true, "addAdmins": true, "anonymous": false, "manageCall": true, "other": true}, "bannedRights": null, "defaultBannedRights": null, "participantsCount": null}}
		};
		const advancedSettings = {mergeSeconds: 5};
		const channel = await socNetImport.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0
		});

		const tgImportClient = new TelegramImportClient(app, {account: {}}, testUser.id, channel, messages, advancedSettings, () => {});
		tgImportClient['getRemotePostLink'] = async (_dbChannel, _msgId) => 'link/' + _msgId;
		telegramClient['getMessagesByClient'] = async (_: any, __: any, [msgId]: any) => {
			return {result: {list: messages.list.filter(i => i.id.toString() === msgId.toString())}} as any;
		};

		await socNetImport.importChannelPosts(tgImportClient);

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id, {}, {});
		assert.equal(groupPosts.length, 3);

		const postDataBySourceId = {
			8: {groupedMsgIds: undefined, replyToMsgId: 7, contents: ['reply to reply'], repostContents: []},
			6: {
				groupedMsgIds: undefined,
				repostOfMsgId: 2520,
				contents: [],
				repostContents: ['Repost from private channel']
			},
			7: {
				groupedMsgIds: undefined,
				replyToMsgId: 6,
				repostOfMsgId: 2521,
				contents: [],
				repostContents: ['Reply from private channel']
			},
		}
		await pIteration.mapSeries(groupPosts, async (gp) => {
			const postContents = await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', gp);
			const repostContents = gp.repostOf ? await app.ms.group.getPostContentWithUrl('https://my.site/ipfs/', gp.repostOf) : [];
			// console.log(gp.localId, 'sourceId', gp.sourcePostId, 'propertiesJson', gp.propertiesJson, 'postContents', postContents.map(rc => rc.text), 'repostContents', repostContents.map(rc => rc.text));
			assert.equal(JSON.parse(gp.propertiesJson).replyToMsgId, postDataBySourceId[gp.sourcePostId].replyToMsgId);
			assert.equal(JSON.parse(gp.propertiesJson).repostOfMsgId, postDataBySourceId[gp.sourcePostId].repostOfMsgId);
			assert.deepEqual(JSON.parse(gp.propertiesJson).groupedMsgIds, postDataBySourceId[gp.sourcePostId].groupedMsgIds);
			assert.deepEqual(postContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].contents);
			assert.deepEqual(repostContents.map(rc => rc.text), postDataBySourceId[gp.sourcePostId].repostContents);
		})
	});
});

