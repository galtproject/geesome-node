/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const {create} = require('ipfs-http-client');
const itFirst = require('it-first');

(async () => {
  const {CID, URL} = process.env;
  const client = create({url: URL || 'http://127.0.0.1:5001'});

  await client.id()
      .then(r => console.log('id r', r))
      .catch(err => console.log('id err', err));

  // await client.dag.put({test: 1}, {storeCodec: 'dag-cbor', inputCodec: 'dag-cbor', format: 'dag-cbor', hashAlg: 'sha2-256'})
  //     .then(r => console.log('put r', r))
  //     .catch(err => console.log('put err', err));
  //
  // await itFirst(client.ls(CID))
  //     .then(r => console.log('ls r', r))
  //     .catch(err => console.log('ls err', err));
  //
  // await itFirst(client.cat(CID))
  //     .then(r => console.log('cat r', r))
  //     .catch(err => console.log('cat err', err));
  //
  // await client.pin.add(CID)
  //     .then(r => console.log('pin r', r))
  //     .catch(err => console.log('pin err', err));
  //
  // await itFirst(client.files.ls('/ipfs/' + CID))
  //     .then(r => console.log('files ls r', r))
  //     .catch(err => console.log('files ls err', err));

  // await client.id()
  //     .then(r => console.log('id r', r))
  //     .catch(err => console.log('id err', err));
})();