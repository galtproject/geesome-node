/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = {
  databaseModule: 'sql',
  databaseConfig: {},
  storageModule: process.env.STORAGE_MODULE || 'js-ipfs',
  storageConfig: {
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
  renderModule: 'entity-json-manifest',
  renderConfig: {},
  modules: process.env.MODULES ? process.env.MODULES.split(',') : ['api', 'accountStorage', 'communicator', 'asyncOperation', 'group', 'groupCategory', 'fileCatalog', 'invite', 'telegramClient', 'staticSiteGenerator', 'rss', 'ethereumAuthorization']
};
