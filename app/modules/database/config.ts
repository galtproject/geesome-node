/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
const log = require('debug')('geesome:database');

module.exports = {
  'name': 'geesome_node',
  'user': 'geesome',
  'password': 'geesome',
  'options': {
    'logging': (d) => {/*log(d)*/},
    'host': 'localhost',
    // 'dialect': 'postgres',
    'dialect': 'sqlite',
    'storage': `${process.env.DATA_DIR || 'data'}/core.sqlite`
  }
};
