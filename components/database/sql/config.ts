/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

module.exports = {
  'name': 'geesome_node',
  'user': 'geesome',
  'password': 'geesome',
  'options': {
    'logging': (d) => {console.log(d)},
    'host': 'localhost',
    // 'dialect': 'postgres',
    'dialect': 'sqlite',
    'storage': 'data/database.sqlite'
  }
};
