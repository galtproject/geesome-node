/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

//TODO: move communicator and fileCatalog to improve
const modulePacks = {
  'main': ['drivers', 'database', 'api', 'accountStorage', 'communicator', 'storage', 'content', 'staticId', 'asyncOperation', 'group', 'entityJsonManifest', 'remoteGroup'],
  'improve': ['groupCategory', 'invite', 'staticSiteGenerator', 'rss', 'autoActions', 'pin', 'foreignAccounts', 'ethereumAuthorization', 'fileCatalog', 'gateway'],
  'socNet': ['socNetAccount', 'socNetImport', 'telegramClient', 'twitterClient', 'tgContentBot']
};

//TODO: refactor modules config
module.exports = {
  databaseModule: 'sql',
  databaseConfig: {},
  storageConfig: {
    implementation: process.env.STORAGE_MODULE || 'js-ipfs',
    jsNode: {
      // getting by getSecretKey
      pass: '',
      // repo: '~/.jsipfs',
    },
    goNode: {url: process.env.STORAGE_URL || 'http://127.0.0.1:5001'}
  },
  modules: process.env.MODULES ? process.env.MODULES.split(',') : modulePacks.main.concat(modulePacks.improve).concat(modulePacks.socNet)
};
