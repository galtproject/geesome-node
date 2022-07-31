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
  'improve': ['groupCategory', 'invite', 'socNetAccount', 'socNetImport', 'telegramClient', 'staticSiteGenerator', 'rss', 'autoActions', 'pin', 'foreignAccounts', 'ethereumAuthorization', 'fileCatalog', 'gateway']
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
    goNode: {
      // host: 'ipfs.infura.io', port: '5001', protocol: 'https'
      host: process.env.STORAGE_HOST || 'localhost',
      port: process.env.STORAGE_PORT || '5001',
      protocol: process.env.STORAGE_PORT || 'http'
    }
  },
  modules: process.env.MODULES ? process.env.MODULES.split(',') : modulePacks.main.concat(modulePacks.improve)
};
