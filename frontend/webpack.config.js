/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

"use strict";

const coreConfig = require('geesome-vue-components/webpack.config');
const SpeedMeasurePlugin = require("speed-measure-webpack-plugin");
const smp = new SpeedMeasurePlugin();

const entry = {
  'babel-polyfill': 'babel-polyfill',
  'app.js': './src/main.ts'
};

process.env.BUILD_HASH = (Math.random() * 10 ** 20).toString(10);

const UIThread = Object.assign({}, coreConfig({
  path: __dirname,
  disableObfuscator: true,
  cacheGroups: {
    vue: {
      test: /[\\/]node_modules\/(vue.*)[\\/]/,
      name: 'vue.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    ipfs: {
      test: /[\\/]node_modules\/(ipfs.*)[\\/]/,
      name: 'ipfs.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    lodash: {
      test: /[\\/]node_modules\/(lodash.*)[\\/]/,
      name: 'lodash.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    async: {
      test: /[\\/]node_modules\/(async.*)[\\/]/,
      name: 'async.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    axios: {
      test: /[\\/]node_modules\/(axios.*)[\\/]/,
      name: 'axios.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    moment: {
      test: /[\\/]node_modules\/(moment.*)[\\/]/,
      name: 'moment.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    ethers: {
      test: /[\\/]node_modules\/(ethers.*)[\\/]/,
      name: 'ethers.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    openpgp: {
      test: /[\\/]node_modules\/(openpgp.*)[\\/]/,
      name: 'openpgp.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    'node-forge': {
      test: /[\\/]node_modules\/(node-forge.*)[\\/]/,
      name: 'node-forge.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    web3: {
      test: /[\\/]node_modules\/(web3.*)[\\/]/,
      name: 'web3.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
    galtproject: {
      test: /[\\/]node_modules\/(.*galtproject.*)[\\/]/,
      name: 'galtproject.js',
      chunks: 'all',
      enforce: true,
      priority: -5
    },
  },
  copy: [
    {from: "./assets", to: "./assets"},
    {from: "./locale", to: "./locale"},
    {from: "./node_modules/font-awesome/webfonts", to: "./build/webfonts"},
    //TODO: exclude .js files from mediaelement
    {from: "./node_modules/mediaelement/build", to: "./build"},
  ]
}), {
  name: "Geesome UI",
  //https://github.com/vuematerial/vue-material/issues/1182#issuecomment-345764031
  entry,
  output: {
    filename: './build/[name]'
  }
});

module.exports = smp.wrap(UIThread);
