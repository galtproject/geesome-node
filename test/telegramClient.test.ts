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
	CorePermissionName, PostStatus,
} from "../app/modules/database/interface";
import IGeesomeTelegramClient from "../app/modules/telegramClient/interface";

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

	let app: IGeesomeApp, telegramClient: IGeesomeTelegramClient;

	const versions = ['v1'];//'ipfs-http-client'

	versions.forEach((appVersion) => {
		describe('app ' + appVersion, () => {
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
					telegramClient = app.ms['telegramClient'];
				} catch (e) {
					console.error('error', e);
					assert.equal(true, false);
				}

				telegramClient['downloadMediaByClient'] = (client, media) => {
					const {file} = telegramHelpers.getMediaFileAndSize(media);
					if (!file) {
						return { client, result: null };
					}
					return {
						result: {
							content: _base64ToArrayBuffer('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAABR1BMVEUAAAAgM1cgM1cgM1cgNFggNFggM1cgM1cgM1cgM1ccO2MgM1cgM1cgM1cgM1cgM1cgM1ccPGQgM1cgM1cgM1cfNFkgM1cgM1cgM1c8TGw9Tm0gM1cgM1cgM1cgM1cgM1cgM1cgM1c9TW0+Tm0gM1cgM1clOFsPWY8Fba0BdrsFba4UTX0CdLgBd7wGbKspRGk2ir4UTX4DcrQbVoYmicQFbq8OWpAHaacfNFkHaqkOW5IXR3VWZH8TUIILYZsFbq4Bd7suQWMvQmTp6u4lPWIDdLcNXZYwQ2QZQ28SUoUXRnQeOmGnrryLlaf///94g5kWSXg3SWrk5utgbYcPWI8WSnlmc4y0usfGy9TS1t2dprXl5+wzRWYsPmBve5P8/PygqLf39/n9/f7W2eD5+fr3+Pl3gph5hJp3g5n4+Pnj5er+/v6gqLjJuAnyAAAAJ3RSTlMALJLU9PXVky0H/ZUIvL2Ulv0u1/X4+NbY/f4wl5m/wAmY/f4v2flxXoaXAAAAAW9yTlQBz6J3mgAAANdJREFUGNNjYAACRiZmFlY2dg4GCOBk51LX0NTUUufi5gHzebV1dIFAT9/AkA8kwq+tCwZGxia6hgJA/Vw6unCgIyjEwK6ua4oQMeNmYNMyt7CEC5gKM4hYWdvY6ura2YMFHEQZRBydnF1c3dw9NDU9tb28xRjEfXz9/AMCg4JDQsPCIyIlGPij/PyiYyL9omPj4v38EgQYhCQT/fyS/Pz8klP8/FKlpBkYZNL84CBdFuhSHrmMVAg3M11eAeQZHkWlhKzs7KwcZVkFqH9VBFTV1FRlpEFsANI2LfvWO/vxAAAAAElFTkSuQmCC'),
							mimeType: 'image/jpg'
						}
					};
				};
			});

			afterEach(async () => {
				await app.ms.database.flushDatabase();
				await telegramClient.flushDatabase();
				await app.stop();
			});

			it('webpage message should import properly', async () => {
				const testUser = (await app.ms.database.getAllUserList('user'))[0];
				const testGroup = (await app.ms.database.getAllGroupList('test'))[0];

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

				const contents = await telegramClient.messageToContents(null, message, testUser.id);
				assert.equal(contents.length, 3);
				const [imageContent, linkContent, messageContent] = contents;
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
				const [imageC, linkC, messageC] = postContents;

				assert.equal(imageC.type, 'image');
				assert.equal(imageC.mimeType, 'image/jpg');
				assert.equal(imageC.view, 'media');
				assert.equal(imageC.manifestId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
				assert.equal(imageC.url, 'https://my.site/ipfs/QmQ6thGsFtJstZu2PKkZ11zLwdXNnL1kyd2TqYHLZB33tr');

				assert.equal(linkC.type, 'text');
				assert.equal(linkC.mimeType, 'text/plain');
				assert.equal(linkC.view, 'link');
				assert.equal(linkC.manifestId, 'bafyreifzmmfrrksjzjjamcz5mvtejxljiec6h7jsiimuo36z3pwtrbmhfe');
				assert.equal(linkC.text, 'https://vas3k.ru/blog/machine_learning/');

				assert.equal(messageC.type, 'text');
				assert.equal(messageC.mimeType, 'text/html');
				assert.equal(messageC.view, 'contents');
				assert.equal(messageC.manifestId, 'bafyreiajv76tijggtjfrjlmuqmzkchp6ivofamkvekcvfemij6qf7ocyy4');
				assert.equal(messageC.text, 'btw, а это тут было: <a href="https://vas3k.ru/blog/machine_learning/">https://vas3k.ru/blog/machine_learning/</a>?');
			});

			it('local webpage message should import properly', async () => {
				const testUser = (await app.ms.database.getAllUserList('user'))[0];

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


				const contents = await telegramClient.messageToContents(null, message, testUser.id);
				assert.equal(contents.length, 2);
				const [linkContent, textContent] = contents;
				assert.equal(linkContent.view, ContentView.Link);
				console.log(await app.ms.storage.getFileDataText(linkContent.mediumPreviewStorageId), telegramClient.mediaWebpageToPreviewHtml(message.media.webpage));
				assert.equal(textContent.view, ContentView.Contents);
			});

			it('should merge posts', async () => {
				const testUser = (await app.ms.database.getAllUserList('user'))[0];
				const testGroup = (await app.ms.database.getAllGroupList('test'))[0];

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
				}

				const msgData = {dbChannelId: channel.id, userId: testUser.id, timestamp: message1.date};

				const contents1 = await telegramClient.messageToContents(null, message1, testUser.id);
				assert.equal(contents1.length, 1);
				assert.equal(contents1[0].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');

				postData.contents = contents1;
				let post1 = await telegramClient.publishPost(importState, null, postData, [message1.id], msgData);
				assert.equal(post1.contents.length, 1);

				const contents2 = await telegramClient.messageToContents(null, message2, testUser.id);
				assert.equal(contents2.length, 2);
				assert.equal(contents2[0].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
				assert.equal(contents2[1].manifestStorageId, 'bafyreidinxfgg7j64j7zfjuyhkeihciypl6inpvw3mi3maxbyiltuimfpi');

				postData.sourcePostId = message2.id;
				postData.sourceDate = new Date(message2.date * 1000);
				postData.contents = contents2;

				msgData.timestamp = message2.date;

				const post2 = await telegramClient.publishPost(importState, null, postData, [message2.id], msgData);
				assert.equal(post2.id, post1.id);
				assert.equal(post2.contents.length, 3);
				assert.equal(post2.contents[0].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');
				assert.equal(post2.contents[1].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
				assert.equal(post2.contents[2].manifestStorageId, 'bafyreidinxfgg7j64j7zfjuyhkeihciypl6inpvw3mi3maxbyiltuimfpi');

				message1.message = 'test';
				message1.entities = [];
				const contents3 = await telegramClient.messageToContents(null, message1, testUser.id);
				assert.equal(contents3.length, 1);
				assert.equal(contents3[0].manifestStorageId, 'bafyreid7t7hx3c6jfbffws2pqr54n23grqxoywj6blicff7p7ylgixehby');

				message1.id -= 1;
				message1.date -= 10;
				postData.contents = contents3;

				postData.sourcePostId = message1.id;
				postData.sourceDate = new Date(message1.date * 1000);
				postData.contents = contents3;

				msgData.timestamp = message1.date;

				let post3 = await telegramClient.publishPost(importState, null, postData, [message1.id], msgData);
				assert.equal(post3.contents.length, 1);
				assert.notEqual(post2.id, post3.id);

				message1.date += 9;
				msgData.timestamp = message1.date;

				const existsChannelMessage = await telegramClient.findExistsChannelMessage(message1.id, channel.id, testUser.id);
				assert.equal(existsChannelMessage.msgId, message1.id);

				post3 = await telegramClient.publishPost(importState, existsChannelMessage, postData, [message1.id], msgData);
				assert.equal(post3.contents.length, 4);
				assert.equal(post3.contents[0].manifestStorageId, 'bafyreid7t7hx3c6jfbffws2pqr54n23grqxoywj6blicff7p7ylgixehby');
				assert.equal(post3.contents[1].manifestStorageId, 'bafyreiahjfoe22losimiveztmjdicikq2m3cg6nu4imwop2vokn4y6uspe');
				assert.equal(post3.contents[2].manifestStorageId, 'bafyreicz6serfekjba3dhidcxevtrioxbf7vt4gmpgy2oakmcj7tfe5bte');
				assert.equal(post3.contents[3].manifestStorageId, 'bafyreidinxfgg7j64j7zfjuyhkeihciypl6inpvw3mi3maxbyiltuimfpi');
				assert.notEqual(post2.id, post3.id);

				post1 = await app.ms.database.getPost(post1.id);
				assert.equal(post1.isDeleted, true);
			});
		});
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