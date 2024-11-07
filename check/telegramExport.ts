/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import appConfig from '../app/config.js';
import GeesomeApp from "../app/index.js";
import {IGeesomeApp} from "../app/interface.js";
import {CorePermissionName,} from "../app/modules/database/interface.js";
import TelegramClient from "../app/modules/telegramClient/index.js";

// const ipfsHelper = require("geesome-libs/src/ipfsHelper");
// import assert from "assert";
// const { generateRandomData } = require('./helpers');
// import pIteration from 'p-iteration';

(async () => {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}}};
  appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
  let app: IGeesomeApp;
  let group, user;

  try {
    app = await GeesomeApp({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

    await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
    user = await app.registerUser({email: 'user@user.com', name: 'user', password: 'user', permissions: [CorePermissionName.UserAll]});
    group = await app.ms.group.createGroup(user.id, {
      name: 'microwave',
      title: 'Microwave'
    }).then(() => app.ms.group.getGroupByParams({name: 'microwave'}));
  } catch (e) {
    console.error(e);
    // group = await app.createGroup(user.id, {
    //   name: 'microwave',
    //   title: 'Microwave'
    // })
  }

  const telegram = await TelegramClient(app);

  // const {client, result: channelInfo} = await telegram.getChannelInfoByUserId(2, 'inside_microwave'); //1,2,3,4,5,
  // const {result: file} = await telegram.downloadMediaByClient(client, { photo: channelInfo.fullChat.chatPhoto });
  // const content = await app.saveData(file.content, '', {
  //   mimeType: file.mimeType,
  //   userId: 3,
  // });
  // await app.updateGroup(4, 2, {
  //   title: channelInfo.chats[0].title,
  //   name: channelInfo.chats[0].username,
  //   description: channelInfo.fullChat.about,
  //   avatarImageId: content.id
  // });

  // https://my.telegram.org/
  // const res = await telegram.login(user.id, {
  //   phoneNumber: '',
  //   password: '',
  //   apiId: '',
  //   apiHash: '',
  //   phoneCodeHash: '',
  //   phoneCode: ''
  // });
  // console.log('res', res);
  // await app.updateGroup(4, 2, {
  //   publishedPostsCount: 0,
  // });
  //
  // await app.database['models'].Post.destroy({where: {}});
  //
  // let groupedId = null;
  // let groupedDate = null;
  // let groupedContent = [];
  // const {client, result: messages} = await telegram.getMessagesByUserId(2, 'inside_microwave', [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25]); //1,2,3,4,5,
  // await pIteration.forEachSeries(messages, async (m, i) => {
  //   let contents = [];
  //
  //   if (m.media) {
  //     // console.log('m.media.mimeType', m.media);
  //     // console.log('downloadMedia', await telegram.downloadMedia(2, m.media));
  //     const {result: file} = await telegram.downloadMediaByClient(client, m.media);
  //     const content = await app.saveData(file.content, '', {
  //       mimeType: file.mimeType,
  //       userId: 3,
  //     });
  //     contents.push(content);
  //
  //     if (m.media.webpage) {
  //       //TODO: add view type - link
  //       const content = await app.saveData(m.media.webpage.url, '', {
  //         mimeType: 'text/plain',
  //         userId: 3,
  //       });
  //       contents.push(content);
  //     }
  //   }
  //
  //   if (m.message) {
  //     const content = await app.saveData(m.message, '', {
  //       mimeType: 'text/plain',
  //       userId: 3,
  //     });
  //     contents.push(content);
  //   }
  //
  //   const postData = {
  //     groupId: 2,
  //     status: 'published',
  //     propertiesJson: JSON.stringify({
  //       source: 'telegram',
  //       originalUrl: ''
  //     })
  //   }
  //
  //   console.log('m.groupedId', m.groupedId && m.groupedId.toString());
  //   if (
  //       (groupedId && !m.groupedId) || // group ended
  //       (groupedId && m.groupedId && m.groupedId.toString() !== groupedId) || // new group
  //       i === messages.length - 1 // messages end
  //   ) {
  //     if (groupedContent.length) {
  //       await app.createPost(4, {
  //         publishedAt: groupedDate * 1000,
  //         contents: groupedContent,
  //         ...postData
  //       });
  //     }
  //     groupedContent = [];
  //     groupedId = null;
  //     groupedDate = null;
  //   }
  //
  //   if (m.groupedId) {
  //     groupedContent = groupedContent.concat(contents);
  //     groupedId = m.groupedId.toString();
  //     groupedDate = m.date;
  //   } else if (contents.length) {
  //     return app.createPost(4, {
  //       publishedAt: m.date * 1000,
  //       contents,
  //       ...postData
  //     });
  //   }
  // });

  const ssg = await (await import('../app/modules/staticSiteGenerator/index.js')).default(app);
  await ssg.generateGroupSite(1, 'group', 2);

  // await app.database.flushDatabase();
  // await app.stop();
})();