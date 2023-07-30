const TelegramBot = require('node-telegram-bot-api');
import * as _ from 'lodash';
const { Op } = require('sequelize');
const axios = require('axios');
const { createWorker } = require('tesseract.js');
const commonHelpers = require('geesome-libs/src/common');

class MultiTelegramBot {
  constructor(models){
    this.models = models;
  }
  events = [];
  models = {};
  async triger(body, tgToken, host) {
    const botId = tgToken.split(':')[0];
    const tokenHash = commonHelpers.hash(tgToken);
    const tgcontentbot = await this.models['ContentBots'].findOne({ where: { botId, tokenHash } });
    if (!tgcontentbot) {
      return;
    }
    this.events.forEach(event => {
      let entity;
      if (body.message && event.text && event.text.test(body.message.text)){
        entity = body.message;
      } else if (body.inline_query && event.type == "inline_query") {
        entity = body.inline_query;
      } else if (body.callback_query && event.type == "callback_query"){
        entity = body.callback_query;
      } else if (body.message && body.message.photo && event.type == "photo") {
        entity = body.message;
      }
      if (!entity){
        return
      }
      entity.host = host;
      entity.userId = tgcontentbot.userId;
      entity.bot = new TelegramBot(tgToken, {polling: false});
      event.callback(entity, entity.text && event.text && event.text.test ? entity.text.match(event.text) : undefined);
    });
  };
  onText(text, callback) {
    this.events.push({text, callback});
  };
  on(type, callback){
    this.events.push({type, callback});
  };
}

module.exports = async (app) => {
  const models = await require("./models")();
  const multitelegrambot = new MultiTelegramBot(models);

  function idToString(id) {
    return id.toString().split('.')[0];
  }

    app.ms.api.onAuthorizedPost('content-bot/add', async (req, res) => {
      const botId = req.body.tgToken.split(":")[0];
      const encryptedToken = await app.encryptTextWithAppPass(req.body.tgToken);
      const tokenHash = await commonHelpers.hash(req.body.tgToken);
      const bot = new TelegramBot(req.body.tgToken, { polling: false });
      const botInfo = await bot.getMe();
      await models.ContentBots.create({encryptedToken, botId, socNet: req.body.socNet, botUsername: botInfo.username, userId: req.user.id, tokenHash});
      bot.setWebHook(`https://${req.headers.host}/api/v1/content-bot/tg-webhook/${req.body.tgToken}`).then(() => {
        console.log('Webhook successfully set');
      });
      bot.setMyCommands([
        { command: '/start', description: 'Initial greeting' },
        { command: '/savePhoto', description: 'Save photo to ipfs' }
      ]);
      res.send("ok", 200);
    });

    app.ms.api.onAuthorizedPost('content-bot/list', async (req, res) => {
      res.send(await models.ContentBots.findAll({where: {userId: req.user.id}}), 200);
    });

    app.ms.api.onAuthorizedPost('content-bot/addUser', async (req, res) => {
      const pickedObject = _.pick(req.body, ['userTgId', 'contentLimit', 'isAdmin', 'contentBotId']);
      await models.User.create(pickedObject);
      res.send("ok", 200);
    });

    app.ms.api.onPost("content-bot/tg-webhook/:tgToken", async (req, res) => {
      const tgToken = req.params.tgToken;
      multitelegrambot.triger(req.body, tgToken, req.headers.host);
      return res.send("ok", 200);
    });
  
  multitelegrambot.onText(/^\/start$/i, async (msg) => {
    const botId = msg.bot.token.split(":")[0];
    const tgcontentbot = await models.ContentBots.findOne({ where: { botId } });
    let user = await models.User.findOne({ where: { userTgId: idToString(msg.from.id)}, contentBotId: tgcontentbot.id });
    if (!user) {
      await msg.bot.sendMessage(msg.chat.id, 'https://tlgrm.eu/_/stickers/8d6/f82/8d6f8279-7c1c-3184-aa35-6a5edb3919d3/192/12.webp');
      await msg.bot.sendMessage(msg.chat.id, `You can't use the bot because you don't have permission from the admin, this is your telegram id ${msg.from.id}`);
      return
    }
    await user.update({ title: msg.from.first_name });
    await msg.bot.sendSticker(msg.chat.id, 'https://tlgrm.eu/_/stickers/8d6/f82/8d6f8279-7c1c-3184-aa35-6a5edb3919d3/192/4.webp');
    await msg.bot.sendMessage(msg.chat.id, `Hello, good to see you ${msg.from.first_name}!`);
  });

  multitelegrambot.onText(/^\/savePhoto$/i, async (msg) => {
    await msg.bot.sendMessage(msg.chat.id, `${msg.from.first_name}, send here the photo you want to keep`);
  });

  multitelegrambot.on('inline_query', async (query) => {
    console.log("!!!!!!!", query);
    const searchTerm = query.query;
    const botId = query.bot.token.split(":")[0]; 
    const searchResult = await models.Description.findOne({
      where: { botId,
        [Op.or]: [
          { text: { [Op.like]: `%${searchTerm}%` } },
          { aitext: { [Op.like]: `%${searchTerm}%` } }
        ],
      },
      attributes: ['id', 'tgId', 'contentId', 'ipfsContent', 'text'],
    });

    const inlineResults = [];
    if (searchResult) {
      const linky = getLink(query.host, searchResult.ipfsContent);
      const inlineResult = {
        type: 'article',
        id: searchResult.contentId,
        title: searchResult.text,
        input_message_content: {
          message_text: `Here is your picture "${searchResult.text}": ${linky}`,
        },
        thumb_url: linky,
      };
      inlineResults.push(inlineResult);
    }

    query.bot.answerInlineQuery(query.id, inlineResults);
  });

  multitelegrambot.on('photo', async (msg) => {
    const sizes = msg.photo;
    const bestSize = _.orderBy(sizes, ['file_size'], ['desc'])[0];
    const file_id = bestSize.file_id;
    const file_info = await msg.bot.getFile(file_id);
    const download_url = `https://api.telegram.org/file/bot${msg.bot.token}/${file_info.file_path}`;
    let file_extension = '';
    
    const mime_type = file_info.mime_type;
    if (mime_type && mime_type.includes('/')) {
      file_extension = '.' + mime_type.split('/')[1];
    }

    const user = await models.User.findOne({ where: { userTgId: idToString(msg.from.id) } });

    const fileSize = file_info.file_size / 1048576;

    if (user.savedSize + fileSize > user.contentLimit) {
      return await msg.bot.sendMessage(msg.chat.id, `Update your limit`);
    }
    await user.update({ savedSize: user.savedSize + fileSize });
    const file_name = file_id + ".jpg";
    const response = await axios.get(download_url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    const contentObj = await app.ms.content.saveData(msg.userId , buffer, file_name, {
      mimeType: mime_type
    });
    const botId = msg.bot.token.split(":")[0]; 
    console.log('content ipfs', contentObj.storageId);
    const linky = getLink(msg.host, contentObj.storageId);
    models.Description.create({ tgId: idToString(msg.from.id), contentId: contentObj.id, ipfsContent: contentObj.storageId, botId, aitext: await aiRecognition(linky)}).then(description => {
      console.log('description saved with aitext:', description.aitext);
    });

    const keyboard = {
      inline_keyboard: [
        [
          { text: "Add Description", callback_data: `${contentObj.id}:add_description` }
        ]
      ]
    };

    await msg.bot.sendMessage(msg.chat.id, `Here is a link to your content ipfs ${linky}`, { reply_markup: keyboard });
  });

  const waitForCommand = {};

  multitelegrambot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const storageId = query.data.split(':')[0];
    const command = query.data.split(':')[1];
    const botId = query.bot.token.split(":")[0]; 

    if (command === "add_description") {
      const description = await models.Description.findOne({ where: { contentId: storageId , botId , tgId: idToString(query.from.id)} });

      await query.bot.sendMessage(chatId, "Enter a description:");
      waitForCommand[chatId] = `add_description:${description.id}`; 

    }
  });

  multitelegrambot.onText(/.*/, async (msg, match) => {
    if (!match) {
      return;
    }
    const chatId = msg.chat.id;
    const text = match[0];

    if (waitForCommand[chatId] && waitForCommand[chatId].includes("add_description")) {
      const descriptionId = waitForCommand[chatId].split(":")[1];
      await models.Description.update({ text: text }, { where: {id: descriptionId}});
      await msg.bot.sendMessage(chatId, `Description saved successfully: ${text}`);
    }

    delete waitForCommand[chatId];
  });

  async function aiRecognition(linky) {
    const worker = await createWorker();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    const { data: { text } } = await worker.recognize(linky);
    await worker.terminate();
    return text;
  }

  function getLink(host, ipfsHash) {
    return `https://${host}/ipfs/${ipfsHash}`;
  }

  function getCarLink(host, ipfsHash) {
    return `https://${host}/download-car/${ipfsHash}.car`;
  }
  
  return module;
};
