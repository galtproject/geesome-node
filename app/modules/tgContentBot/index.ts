const Sequelize = require('sequelize');
const TelegramBot = require('node-telegram-bot-api');
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
const geesomeClient = new GeesomeClient({ server: 'https://geesome.microwavedev.io:2053', apiKey });
const TG_TOKEN = process.env.TG_TOKEN;

const tgToken = process.env.TG_TOKEN;

module.exports = async (app) => {
  const bot = new TelegramBot(tgToken, { polling: true });
  app.checkModules(['tgContentBot']);

  const options = {
    logging: (d) => {
      if (includes(d, 'FROM `offers`') || includes(d, 'PRAGMA INDEX') || includes(d, 'FROM sqlite_master')) {
        return;
      }
      console.log(d);
    },
    dialect: 'sqlite',
    storage: 'database.sqlite',
  };

  const sequelize = new Sequelize('tgcontent', 'root', 'root', options);
  const models = {
    sequelize: sequelize,
    User: sequelize.define('User', {/* user model definition */}),
    Description: sequelize.define('Description', {/* description model definition */})
    // define other models here
  };

  const modules = {
    bot,
    models,
  };

  //////////////////

  await require('./models')(models);

  function idToString(id) {
    return id.toString().split('.')[0];
  }

  bot.setMyCommands([
    { command: '/start', description: 'Начальное приветствие' },
    { command: '/photo', description: 'Сохранить фото в ipfs' }
  ]);

  bot.onText(/^\/start(@MicroFortBot)?$/i, async (msg) => {
    let user = await models.User.findOne({ where: { tgId: idToString(msg.from.id) } });
    if (!user) {
      user = await models.User.create({ tgId: idToString(msg.from.id), title: msg.from.first_name });
    }

    await bot.sendSticker(msg.chat.id, 'https://tlgrm.ru/_/stickers/8d1/e91/8d1e9143-b58d-4f92-a501-4c946e3728fa/10.webp');
    await bot.sendMessage(msg.chat.id, `Привет, рад тебя видеть ${msg.from.first_name}!`);
  });

  bot.onText(/^\/photo(@MicroFortBot)?$/i, async (msg) => {
    await bot.sendMessage(msg.chat.id, `${msg.from.first_name}, отправь сюда фотографию которую хочешь сохранить`);
  });

  bot.on('inline_query', async (query) => {
    const searchTerm = query.query;
    console.log(searchTerm);

    const searchResult = await models.Description.findOne({
      where: {
        [Op.or]: [
          { text: { [Op.like]: `%${searchTerm}%` } },
          { aitext: { [Op.like]: `%${searchTerm}%` } },
        ],
      },
      attributes: ['id', 'tgId', 'contentId', 'ipfsContent', 'text'],
    });

    // Преобразуйте результат поиска в формат InlineQueryResult
    const inlineResults = [];
    if (searchResult) {
      const linky = await geesomeClient.getContentLink(searchResult.ipfsContent);
      const inlineResult = {
        type: 'article',
        id: searchResult.contentId,
        title: searchResult.text,
        input_message_content: {
          message_text: `Вот твое изображение "${searchResult.text}": ${linky}`,
        },
        thumb_url: linky,
      };
      inlineResults.push(inlineResult);
    }

    // Ответьте на inline-запрос с результатами поиска
    bot.answerInlineQuery(query.id, inlineResults);
  });

  bot.on('photo', async (msg) => {
    const sizes = msg.photo;
    const bestSize = _.orderBy(sizes, ['file_size'], ['desc'])[0];
    const file_id = bestSize.file_id;
    const file_info = await bot.getFile(file_id);
    const download_url = `https://api.telegram.org/file/bot${TG_TOKEN}/${file_info.file_path}`;
    let file_extension = '';

    const mime_type = file_info.mime_type;
    if (mime_type && mime_type.includes('/')) {
      file_extension = '.' + mime_type.split('/')[1];
    }

    const user = await models.User.findOne({ where: { tgId: idToString(msg.from.id) } });

    const fileSize = file_info.file_size / 1048576;

    if (user.photoSize + fileSize > user.contentLimit) {
      return await bot.sendMessage(msg.chat.id, `Обнови свой лимит`);
    }
    await user.update({ photoSize: user.photoSize + fileSize });
    const file_name = file_id + ".jpg";
    const response = await axios.get(download_url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary');
    await geesomeClient.init();
    const contentObj = await geesomeClient.saveContentData(buffer, {
      mimeType: mime_type,
      fileName: file_name
    });
    console.log('content ipfs', contentObj.storageId);
    const linky = await geesomeClient.getContentLink(contentObj.storageId);
    console.log(linky);
    const cave = await models.Description.create({ tgId: idToString(msg.from.id), contentId: contentObj.id, ipfsContent: contentObj.storageId });
    const messageText = `Вот ссылка на твой content ipfs https://ipfs.io/ipfs/${contentObj.storageId}`;
    console.log('content manifest ipld', contentObj.manifestStorageId);

    const worker = await createWorker();

    (async () => {
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data: { text } } = await worker.recognize(linky);
      console.log(text);
      const description = await models.Description.findOne({ where: { contentId: contentObj.id } });
      await description.update({ aitext: text });
      await worker.terminate();
    })();

    const keyboard = {
      inline_keyboard: [
        [
          { text: "Add Description", callback_data: `${contentObj.id}:add_description` }
        ]
      ]
    };

    await bot.sendMessage(msg.chat.id, messageText, { reply_markup: keyboard });
  });

  const waitForCommand = {};

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const storageId = query.data.split(':')[0];
    const command = query.data.split(':')[1];

    if (command === "add_description") {
      const description = await models.Description.findOne({ where: { contentId: storageId } });

      await bot.sendMessage(chatId, "Введите описание:");
      waitForCommand[chatId] = "add_description"; // Записываем команду на ожидание для данного чата

      bot.removeTextListener(/.*/); // Удаляем предыдущий обработчик

      bot.onText(/.*/, async (msg, match) => {
        const chatId = msg.chat.id;
        const text = match[0]; // Получаем текст сообщения

        if (waitForCommand[chatId] === "add_description") {
          await description.update({ text: text });
          await bot.sendMessage(chatId, `Описание успешно сохранено: ${text}`);
        }

        delete waitForCommand[chatId]; // Удаляем команду на ожидание для данного чата
      });
    }
  });

  return module;
};
