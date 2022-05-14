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
import {PostStatus} from "../app/modules/group/interface";

const pIteration = require('p-iteration');

const telegramHelpers = require('../app/modules/telegramClient/helpers');

const assert = require('assert');

describe("telegramClient", function () {
	const databaseConfig = {
		name: 'geesome_test', options: {
			logging: () => {
			}, storage: 'database-test.sqlite'
		}
	};

	this.timeout(60000);

	let admin, app: IGeesomeApp, telegramClient: IGeesomeTelegramClient;

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
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
		let count = 0;

		telegramClient['downloadMediaByClient'] = (client, media) => {
			const {file} = telegramHelpers.getMediaFileAndSize(media);
			if (!file) {
				return {client, result: null};
			}
			count++;
			return {
				result: {
					content: _base64ToArrayBuffer(
						count > 1
							? 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAByFBMVEUgM1cgMlYgMlUeMVUcMFQiMFIhMFMgNFgdOWAcPGUdOWEfNFkhMVMiL1IhMVQgNFgZQm0YQGogNFghMVQfNVsTT4AfNlsgNFghMFMZQm0hMFMgNFggNFgdOmEfNVscO2MnOVwiN1s1RmcyQ2UjNlkkNloXK1BRYHxSYX0XK1AVKU8iNVgiNVkVKU8YLFEpO14pO14YLFEiNVlSYX0XK1AjNlo2R2dAUG82R2ckNloPV40IZ6QFb7AJZqMRUoYFbq8BeL0AeL4GaagrVn8ye6wST4EDc7YBd7wBd70Eba4hYpMmhb8Cc7cTT4EAdrwBdrsGbKwCdbkPWI4IaKUJZaIaP2kIaKYPVIkfUn9QXXgXVIYCdboKX5oGaqgBdboBdLgtQ2ZEV3a/w804V3wEa6sNW5M2TG4eTnoCcrUDcrUQVYoZUoIgU4ArTnWGkKSdpbX29/h9ip8TQ3FHYIDGydJse5MOUoYXUIBsepKssr6+wsyrsb+XoLD8/f3////T1t1baYPAxc/S1t1EVnV2g5nu7/KbpLTj5ur+/v7v8PP9/v79/f7S1d3s7fDk5up9iJ3z9Pb09fd+iZ7k5uuaorPO0trl5+uao7MtbbI9AAAAOnRSTlMAAAAAAAdGntn12Z9HBxiM6emNGan+q45H6kifodv2+Pb42tygokjq60oHjpAIGaytGo/qSaLc+d2j9tPZtgAAAAFvck5UAc+id5oAAAD+SURBVBjTY2BgYGRlY+fg5OTi5uFlZAACJj5+AStrGxtbO0EhYSagPJ+IqL2Dg4Ojk7OLq5gwIwMrv6ibg7u7u4enl7ePrzgrg4SAvaM7GPj5OdhLSjFIW/kHBLpDgUOQDANHcEhoiIO7gwNYIEyWQS48IjLKPzom1sHdPy7eSZ5BISExKTklNS09IzMrOydXkUEpL7+gsKi4pLSsvKKyqlqZQaWmtq6+obGuqbmlta6uTZVBTb29rqOzq667p7eurk9Dk0FLu39CHRRMnKSjy8Csp9/fDuFPnmRgyMzAwKJnZDxl6rRpU6dr6BiygLzLrGViamZubmGpqQuUBwD7mkc7yNTEawAAAABJRU5ErkJggg=='
							: 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABR1BMVEUAAAAgM1cgM1cgM1cgNFggNFggM1cgM1cgM1cgM1ccO2MgM1cgM1cgM1cgM1cgM1cgM1ccPGQgM1cgM1cgM1cfNFkgM1cgM1cgM1c8TGw9Tm0gM1cgM1cgM1cgM1cgM1cgM1cgM1c9TW0+Tm0gM1cgM1clOFsPWY8Fba0BdrsFba4UTX0CdLgBd7wGbKspRGk2ir4UTX4DcrQbVoYmicQFbq8OWpAHaacfNFkHaqkOW5IXR3VWZH8TUIILYZsFbq4Bd7suQWMvQmTp6u4lPWIDdLcNXZYwQ2QZQ28SUoUXRnQeOmGnrryLlaf///94g5kWSXg3SWrk5utgbYcPWI8WSnlmc4y0usfGy9TS1t2dprXl5+wzRWYsPmBve5P8/PygqLf39/n9/f7W2eD5+fr3+Pl3gph5hJp3g5n4+Pnj5er+/v6gqLjJuAnyAAAAJ3RSTlMALJLU9PXVky0H/ZUIvL2Ulv0u1/X4+NbY/f4wl5m/wAmY/f4v2flxXoaXAAAAAW9yTlQBz6J3mgAAANdJREFUGNNjYAACRiZmFlY2dg4GCOBk51LX0NTUUufi5gHzebV1dIFAT9/AkA8kwq+tCwZGxia6hgJA/Vw6unCgIyjEwK6ua4oQMeNmYNMyt7CEC5gKM4hYWdvY6ura2YMFHEQZRBydnF1c3dw9NDU9tb28xRjEfXz9/AMCg4JDQsPCIyIlGPij/PyiYyL9omPj4v38EgQYhCQT/fyS/Pz8klP8/FKlpBkYZNL84CBdFuhSHrmMVAg3M11eAeQZHkWlhKzs7KwcZVkFqH9VBFTV1FRlpEFsANI2LfvWO/vxAAAAAElFTkSuQmCC'),
					mimeType: 'image/jpg'
				}
			};
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
			message: 'Text\n' +
				'\n' +
				'Text after 2 br\n' +
				'Link\n' +
				'www.google.com\n' +
				'Spoiler\n' +
				'Strike\n' +
				'Bold\n' +
				'Italian\n' +
				'Underline\n' +
				'Code',
			entities: [
				{
					CONSTRUCTOR_ID: 1990644519,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityTextUrl',
					classType: 'constructor',
					offset: 22,
					length: 5,
					url: 'https://www.google.com/'
				},
				{
					CONSTRUCTOR_ID: 1859134776,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityUrl',
					classType: 'constructor',
					offset: 27,
					length: 14
				},
				{
					CONSTRUCTOR_ID: 852137487,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntitySpoiler',
					classType: 'constructor',
					offset: 42,
					length: 8
				},
				{
					CONSTRUCTOR_ID: 3204879316,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityStrike',
					classType: 'constructor',
					offset: 50,
					length: 7
				},
				{
					CONSTRUCTOR_ID: 3177253833,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityBold',
					classType: 'constructor',
					offset: 57,
					length: 5
				},
				{
					CONSTRUCTOR_ID: 2188348256,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityItalic',
					classType: 'constructor',
					offset: 62,
					length: 8
				},
				{
					CONSTRUCTOR_ID: 2622389899,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityUnderline',
					classType: 'constructor',
					offset: 70,
					length: 10
				},
				{
					CONSTRUCTOR_ID: 681706865,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityCode',
					classType: 'constructor',
					offset: 80,
					length: 4
				}
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
			entities: [
				{
					CONSTRUCTOR_ID: 1859134776,
					SUBCLASS_OF_ID: 3479443932,
					className: 'MessageEntityUrl',
					classType: 'constructor',
					offset: 21,
					length: 39
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
						sizes: [
							{
								CONSTRUCTOR_ID: 3769678894,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoStrippedSize',
								classType: 'constructor',
								type: 'i',
								bytes: Buffer.from([/*01 14 28 d8 3f a5 27 3d ba 7b 9a 0e 3d 4d 2f e3 40 07 38 a4 e7 23 d2 97 b7 5a 4c 1f 6a 00 07 e3 45 00 f3 d2 8a 00 76 01 a3 14 51 40 06 28 c0 14 51 40 ... 6 more bytes*/]),
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'm',
								w: 320,
								h: 163,
								size: 12107
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'x',
								w: 800,
								h: 408,
								size: 45932
							},
							{
								CONSTRUCTOR_ID: 1976012384,
								SUBCLASS_OF_ID: 399256025,
								className: 'PhotoSize',
								classType: 'constructor',
								type: 'y',
								w: 900,
								h: 459,
								size: 50629
							}
						],
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

		const channel = await telegramClient.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const contents = await telegramClient.messageToContents(null, channel, message, testUser.id);
		assert.equal(contents.length, 3);
		const [messageContent, imageContent, linkContent] = contents;
		assert.equal(imageContent.view, ContentView.Media);
		assert.equal(linkContent.view, ContentView.Link);
		assert.equal(messageContent.view, ContentView.Contents);

		const testPost = await app.ms.group.createPost(testUser.id, {
			contents,
			groupId: testGroup.id,
			status: PostStatus.Published
		});

		const postContents = await app.ms.group.getPostContent('https://my.site/ipfs/', testPost);
		assert.equal(postContents.length, 3);
		const [messageC, imageC, linkC] = postContents;

		assert.equal(imageC.type, 'image');
		assert.equal(imageC.mimeType, 'image/jpg');
		assert.equal(imageC.view, 'media');
		assert.equal(imageC.manifestId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
		assert.equal(imageC.url, 'https://my.site/ipfs/QmQ6thGsFtJstZu2PKkZ11zLwdXNnL1kyd2TqYHLZB33tr');

		assert.equal(linkC.type, 'json');
		assert.equal(linkC.mimeType, 'application/json');
		assert.equal(linkC.view, 'link');
		assert.equal(linkC.manifestId, 'bafyreibwegei7vtbrwq4tee3ag3akyjybplfefl2kmou6iqidmmou5vzpy');
		assert.deepEqual(linkC.json, {
			description: 'Разбираемся простыми словами',
			displayUrl: 'vas3k.ru/blog/machine_learning',
			siteName: 'vas3k.ru',
			title: 'Машинное обучение для людей',
			type: 'url',
			url: 'https://vas3k.ru/blog/machine_learning/'
		});

		assert.equal(messageC.type, 'text');
		assert.equal(messageC.mimeType, 'text/html');
		assert.equal(messageC.view, 'contents');
		assert.equal(messageC.manifestId, 'bafyreiajv76tijggtjfrjlmuqmzkchp6ivofamkvekcvfemij6qf7ocyy4');
		assert.equal(messageC.text, 'btw, а это тут было: <a href="https://vas3k.ru/blog/machine_learning/">https://vas3k.ru/blog/machine_learning/</a>?');
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


		const channel = await telegramClient.createDbChannel({
			userId: testUser.id,
			groupId: testGroup.id,
			channelId: 1,
			title: "1",
			lastMessageId: 0,
			postsCounts: 0,
		});

		const contents = await telegramClient.messageToContents(null, channel, message, testUser.id);
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

		const channel = await telegramClient.createDbChannel({
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

		const contents1 = await telegramClient.messageToContents(null, channel, message1, testUser.id);
		assert.equal(contents1.length, 1);
		assert.equal(contents1[0].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');

		postData.contents = contents1;
		let post1 = await telegramClient.publishPost(importState, null, postData, msgData);
		assert.equal(post1.contents.length, 1);

		const existsChannelMessagePost1 = await telegramClient.findExistsChannelMessage(message1.id, channel.id, testUser.id);
		post1 = await telegramClient.publishPost(importState, existsChannelMessagePost1, postData, msgData);
		assert.equal(post1.contents.length, 1);

		const contents2 = await telegramClient.messageToContents(null, channel, message2, testUser.id);
		assert.equal(contents2.length, 2);
		assert.equal(contents2[0].manifestStorageId, 'bafyreigwjwhygtt3celpyvniiwplehjpweoni7eifv6ttcqnk3m23mzetu');
		assert.equal(contents2[1].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');

		postData.sourcePostId = message2.id;
		postData.sourceDate = new Date(message2.date * 1000);
		postData.contents = contents2;

		msgData.timestamp = message2.date;
		msgData.msgId = message2.id;

		const post2 = await telegramClient.publishPost(importState, null, postData, msgData);
		assert.equal(post2.id, post1.id);
		assert.equal(post2.contents.length, 3);
		assert.equal(post2.contents[0].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');
		assert.equal(post2.contents[1].manifestStorageId, 'bafyreigwjwhygtt3celpyvniiwplehjpweoni7eifv6ttcqnk3m23mzetu');
		assert.equal(post2.contents[2].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');

		message1.message = 'test';
		message1.entities = [];
		const contents3 = await telegramClient.messageToContents(null, channel, message1, testUser.id);
		assert.equal(contents3.length, 1);
		assert.equal(contents3[0].manifestStorageId, 'bafyreid7t7hx3c6jfbffws2pqr54n23grqxoywj6blicff7p7ylgixehby');

		message1.id -= 1;
		message1.date -= 10;
		postData.contents = contents3;

		postData.sourcePostId = message1.id;
		postData.sourceDate = new Date(message1.date * 1000);
		postData.contents = contents3;

		msgData.timestamp = message1.date;
		msgData.msgId = message1.id;

		let post3 = await telegramClient.publishPost(importState, null, postData, msgData);
		const post3PrevId = post3.id;
		assert.equal(post3.contents.length, 1);
		assert.notEqual(post2.id, post3.id);

		message1.date += 9;
		msgData.timestamp = message1.date;

		const existsChannelMessage = await telegramClient.findExistsChannelMessage(message1.id, channel.id, testUser.id);
		assert.equal(existsChannelMessage.msgId, message1.id);

		post3 = await telegramClient.publishPost(importState, existsChannelMessage, postData, msgData);
		assert.equal(post3.contents.length, 4);
		assert.equal(post3.contents[0].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');
		assert.equal(post3.contents[1].manifestStorageId, 'bafyreid7t7hx3c6jfbffws2pqr54n23grqxoywj6blicff7p7ylgixehby');
		assert.equal(post3.contents[2].manifestStorageId, 'bafyreigwjwhygtt3celpyvniiwplehjpweoni7eifv6ttcqnk3m23mzetu');
		assert.equal(post3.contents[3].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
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

		const channel = await telegramClient.createDbChannel({
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

			const contents = await telegramClient.messageToContents(null, channel, m, testUser.id);
			postData.sourcePostId = m.id;
			postData.sourceDate = new Date(m.date * 1000);

			if (m.groupedId) {
				groupedId = m.groupedId;
				groupedContents = contents.concat(groupedContents);
				if (!messages[i + 1] || !messages[i + 1].groupedId) {
					postData.contents = groupedContents;
					await telegramClient.publishPost(importState, null, postData, msgData);
				}
			} else {
				postData.contents = contents;
				await telegramClient.publishPost(importState, null, postData, msgData);
			}
		});

		const {list: groupPosts} = await app.ms.group.getGroupPosts(testGroup.id);
		console.log('groupPosts', await pIteration.map(groupPosts, async p => {
			return {
				id: p.id,
				contents: await pIteration.map(p.contents, async c => (JSON.stringify({
					id: c.id,
					text: c.mimeType.indexOf('text') > -1 ? await app.ms.storage.getFileDataText(c.storageId) : '[image]'
				})))
			};
		}));
		assert.equal(groupPosts.length, 3);
		const [horribleEdgeCases, spotifyPremium, link] = groupPosts;

		console.log(link.publishedAt.getTime() / 1000);
		console.log(spotifyPremium.publishedAt.getTime() / 1000);
		console.log(horribleEdgeCases.publishedAt.getTime() / 1000);
		assert.equal(link.contents.length, 1);
		assert.equal(spotifyPremium.contents.length, 3);
		assert.equal(horribleEdgeCases.contents.length, 3);

		assert.equal(await app.ms.storage.getFileDataText(link.contents[0].storageId), '<a href="https://t.me/ctodailychat/263223">jump to message 👇</a>')
		assert.equal(await app.ms.storage.getFileDataText(spotifyPremium.contents[0].storageId), 'держи)')
		assert.equal(spotifyPremium.contents[1].mimeType, 'image/jpg')
		assert.equal(spotifyPremium.contents[2].mimeType, 'image/jpg')
		assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[0].storageId), '<a href="https://t.me/ctodailychat/263251">jump to message 👇</a>')
		assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[1].storageId), '<a href="https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html">https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html</a>')
		assert.equal(await app.ms.storage.getFileDataText(horribleEdgeCases.contents[2].storageId), JSON.stringify({
			"url": "https://dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html",
			"displayUrl": "dustri.org/b/horrible-edge-cases-to-consider-when-dealing-with-music.html",
			"siteName": "dustri.org",
			"title": "Horrible edge cases to consider when dealing with music",
			"description": "Personal blog of Julien (jvoisin) Voisin",
			"type": "url"
		}))
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

		const channel = await telegramClient.createDbChannel({
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

		const contents1 = await telegramClient.messageToContents(null, channel, message1, testUser.id);
		assert.equal(contents1.length, 2);
		assert.equal(contents1[0].manifestStorageId, 'bafyreicwdifjygmoc64jpxvz2dsuibhbinqqfdd4yeybur3egkdvfjphx4');
		assert.equal(contents1[1].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');

		postData.contents = contents1;
		let post1 = await telegramClient.publishPost(importState, null, postData, msgData);
		assert.equal(post1.contents.length, 2);

		const contents2 = await telegramClient.messageToContents(null, channel, message2, testUser.id);
		assert.equal(contents2.length, 1);
		assert.equal(contents2[0].manifestStorageId, 'bafyreigzlgo4uejpzomdjic5d5pvfilsbgbty5gt3of43f5rnfe6y46suq');

		postData.sourcePostId = message2.id;
		postData.sourceDate = new Date(message2.date * 1000);
		postData.contents = contents2;
		msgData.msgId = message2.id

		const post2 = await telegramClient.publishPost(importState, null, postData, msgData);
		assert.equal(post2.id, post1.id);
		assert.equal(post2.contents.length, 3);
		assert.equal(post2.contents[0].manifestStorageId, 'bafyreicwdifjygmoc64jpxvz2dsuibhbinqqfdd4yeybur3egkdvfjphx4');
		assert.equal(post2.contents[1].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
		assert.equal(post2.contents[2].manifestStorageId, 'bafyreigzlgo4uejpzomdjic5d5pvfilsbgbty5gt3of43f5rnfe6y46suq');
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