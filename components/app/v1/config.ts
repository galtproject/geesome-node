/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = {
  databaseModule: 'sql',
  databaseConfig: {},
  storageModule: 'js-ipfs',
  storageConfig: {
    jsNode: {
      // getting by getSecretKey
      pass: '',
      // repo: '~/.jsipfs',
      EXPERIMENTAL: {
        pubsub: true,
        ipnsPubsub: true
      }
    },
    goNode: {
      // host: 'ipfs.infura.io', port: '5001', protocol: 'https'
      host: 'localhost',
      port: '5001',
      protocol: 'http'
    }
  },
  apiModule: 'http-v1',
  apiConfig: {},
  authorizationModule: 'passport',
  authorizationConfig: {},
  renderModule: 'entity-json-manifest',
  renderConfig: {}
};
