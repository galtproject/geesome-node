/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const log = require('../app/helpers').log;
const { generateRandomData } = require('./helpers');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

(async () => {
  const hat = require('hat');
  const {createFactory} = require('ipfsd-ctl');

  const factory = createFactory({
    type: 'js', // or 'js' to run in a separate process
    exec: require('ipfs'),
    // type: 'js',
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsModule: require('ipfs'), // only if you gonna spawn 'proc' controllers
  })

  const node = await factory.spawn({
    ipfsOptions: {
      pass: hat(),
      init: true,
    },
    // preload: {enabled: false, addresses: await this.getPreloadAddresses()}
  });

  const megabyte = 100 * 1024 * 1024;
  for (let i = 0; i < 100; i++) {
    const randomData = await generateRandomData(megabyte);
    const before = new Date().getTime();
    const result = await node.api.add([{
      content: randomData,
    }], {pin: false});
    const after = new Date().getTime();
    // const contentObj = await app.storage.getObject(textContent.manifestStorageId);
    log(after - before, ipfsHelper.cidToIpfsHash(result.cid));
  }
})();