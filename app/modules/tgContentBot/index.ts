const Sequelize = require('sequelize');
const TelegramBot = require('node-telegram-bot-api');
const pIteration = require("p-iteration");

require('dotenv').config();

process.env.NTBA_FIX_319 = '1';
process.env.NTBA_FIX_350 = '1';

const tgToken = process.env.TG_TOKEN;
const bot = new TelegramBot(tgToken, { polling: true });

(async () => {
  const models = {
    sequelize: new Sequelize('tgcontent', 'root', 'root', require('./config').options),
  };

  const modules: any = {
    bot,
    models,
  };

  await pIteration.forEachSeries(['content'], async (moduleName: string) => {
    console.log('Load module ' + moduleName);
    modules[moduleName] = await require('./' + moduleName)(modules);
  });

  console.log('Loading finished');
})();
