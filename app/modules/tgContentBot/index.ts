const Sequelize = require('sequelize');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const { IGeesomeApp } = require("../../interface");
const includes = require('lodash/includes');
const pIteration = require("p-iteration");
const lodash_underscore: any = require("lodash");
const { GeesomeClient } = require('geesome-libs/src/GeesomeClient');
const { Op } = require('sequelize');
const axios = require('axios');
const { createWorker } = require('tesseract.js');


require('dotenv').config();

process.env.NTBA_FIX_319 = '1';
process.env.NTBA_FIX_350 = '1';
const apiKey = process.env.GEESOME_KEY;
const geesomeClient = new GeesomeClient({ server: 'https://geesome.microwavedev.io', apiKey });
const TG_TOKEN = process.env.TG_TOKEN;

const tgToken = process.env.TG_TOKEN;

module.exports = async (app) => {
  const models = await require("./models")();

  // function idToString(id) {
  //   return id.toString().split('.')[0];
  // }

    app.ms.api.onAuthorizedPost('tg-content-bot/add', async (req, res) => {
      const botId = req.body.tgToken.split(":")[0];
      const encryptedToken = await app.encryptTextWithAppPass(req.body.tgToken);
      await models.TgContentBots.create({encryptedToken: encryptedToken, botId: botId, userId: req.user.id});
      const bot = new TelegramBot(req.body.tgToken, { polling: false });
      bot.setWebHook('https://vlad.microwavedev.io/api/v1/tg-content-bot/webhook/' + req.body.tgToken).then(() => {
        console.log('Webhook successfully set');
      });
      res.send("ok", 200);
    });

    app.ms.api.onPost("tg-content-bot/webhook/:tgToken", async (req, res) => {
      console.log(req.body)
      return res.send("ok", 200);
    });


  // bot.setMyCommands([
  //   { command: '/start', description: 'Initial greeting' },
  //   { command: '/photo', description: 'Save photo to ipfs' }
  // ]);

  // bot.onText(/^\/start()?$/i, async (msg) => {
  //   let user = await models.User.findOne({ where: { tgId: idToString(msg.from.id) } });
  //   if (!user) {
  //     user = await models.User.create({ tgId: idToString(msg.from.id), title: msg.from.first_name });
  //   }

  //   await bot.sendSticker(msg.chat.id, 'https://tlgrm.ru/_/stickers/8d1/e91/8d1e9143-b58d-4f92-a501-4c946e3728fa/10.webp');
  //   await bot.sendMessage(msg.chat.id, `Hello, good to see you ${msg.from.first_name}!`);
  // });

  // bot.onText(/^\/photo()?$/i, async (msg) => {
  //   await bot.sendMessage(msg.chat.id, `${msg.from.first_name}, send here the photo you want to keep`);
  // });

  // bot.on('inline_query', async (query) => {
  //   const searchTerm = query.query;
  //   console.log(searchTerm);

  //   const searchResult = await models.Description.findOne({
  //     where: {
  //       [Op.or]: [
  //         { text: { [Op.like]: `%${searchTerm}%` } },
  //         { aitext: { [Op.like]: `%${searchTerm}%` } },
  //       ],
  //     },
  //     attributes: ['id', 'tgId', 'contentId', 'ipfsContent', 'text'],
  //   });

  //   const inlineResults = [];
  //   if (searchResult) {
  //     const linky = await geesomeClient.getContentLink(searchResult.ipfsContent);
  //     const inlineResult = {
  //       type: 'article',
  //       id: searchResult.contentId,
  //       title: searchResult.text,
  //       input_message_content: {
  //         message_text: `Here is your picture "${searchResult.text}": ${linky}`,
  //       },
  //       thumb_url: linky,
  //     };
  //     inlineResults.push(inlineResult);
  //   }

  //   bot.answerInlineQuery(query.id, inlineResults);
  // });

  // bot.on('photo', async (msg) => {
  //   const sizes = msg.photo;
  //   const bestSize = lodash_underscore.orderBy(sizes, ['file_size'], ['desc'])[0];
  //   const file_id = bestSize.file_id;
  //   const file_info = await bot.getFile(file_id);
  //   const download_url = `https://api.telegram.org/file/bot${TG_TOKEN}/${file_info.file_path}`;
  //   let file_extension = '';

  //   const mime_type = file_info.mime_type;
  //   if (mime_type && mime_type.includes('/')) {
  //     file_extension = '.' + mime_type.split('/')[1];
  //   }

  //   const user = await models.User.findOne({ where: { tgId: idToString(msg.from.id) } });

  //   const fileSize = file_info.file_size / 1048576;

  //   if (user.photoSize + fileSize > user.contentLimit) {
  //     return await bot.sendMessage(msg.chat.id, `Update your limit`);
  //   }
  //   await user.update({ photoSize: user.photoSize + fileSize });
  //   const file_name = file_id + ".jpg";
  //   const response = await axios.get(download_url, { responseType: 'arraybuffer' });
  //   const buffer = Buffer.from(response.data, 'binary');
  //   await geesomeClient.init();
  //   const contentObj = await geesomeClient.saveContentData(buffer, {
  //     mimeType: mime_type,
  //     fileName: file_name
  //   });
  //   console.log('content ipfs', contentObj.storageId);
  //   const linky = await geesomeClient.getContentLink(contentObj.storageId);
  //   console.log(linky);
  //   const cave = await models.Description.create({ tgId: idToString(msg.from.id), contentId: contentObj.id, ipfsContent: contentObj.storageId });
  //   const messageText = `Here is a link to your content ipfs https://ipfs.io/ipfs/${contentObj.storageId}`;
  //   console.log('content manifest ipld', contentObj.manifestStorageId);

   
  //   const keyboard = {
  //     inline_keyboard: [
  //       [
  //         { text: "Add Description", callback_data: `${contentObj.id}:add_description` }
  //       ]
  //     ]
  //   };

  //   await bot.sendMessage(msg.chat.id, messageText, { reply_markup: keyboard });
  // });

  // const waitForCommand = {};

  // bot.on("callback_query", async (query) => {
  //   const chatId = query.message.chat.id;
  //   const storageId = query.data.split(':')[0];
  //   const command = query.data.split(':')[1];

  //   if (command === "add_description") {
  //     const description = await models.Description.findOne({ where: { contentId: storageId } });

  //     await bot.sendMessage(chatId, "Enter a description:");
  //     waitForCommand[chatId] = "add_description"; 

  //     bot.removeTextListener(/.*/); 

  //     bot.onText(/.*/, async (msg, match) => {
  //       const chatId = msg.chat.id;
  //       const text = match[0];

  //       if (waitForCommand[chatId] === "add_description") {
  //         await description.update({ text: text });
  //         await bot.sendMessage(chatId, `Description saved successfully: ${text}`);
  //       }

  //       delete waitForCommand[chatId];
  //     });
  //   }
  // });

  // async function airecognition(linky, contentObj, models) {
  //   const worker = await createWorker();
    
  //   await worker.loadLanguage('eng');
  //   await worker.initialize('eng');
  //   const { data: { text } } = await worker.recognize(linky);
  //   console.log(text);
  //   const description = await models.Description.findOne({ where: { contentId: contentObj.id } });
  //   await description.update({ aitext: text });
  //   await worker.terminate();
  // }
  
  return module;
};
