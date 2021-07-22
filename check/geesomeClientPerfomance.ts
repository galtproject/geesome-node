/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const { GeesomeClient } = require('geesome-libs/src/GeesomeClient');

const log = require('../components/log');
const http = require('http');
const { generateRandomData } = require('./helpers');

(async () => {
  const geesomeClient = new GeesomeClient({ server: 'http://localhost:7711' });

  await geesomeClient.init();

  if (await geesomeClient.isNodeEmpty()) {
    await geesomeClient.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
  } else {
    await geesomeClient.loginPassword("admin", "admin");
  }

  const megabyte = 100 * 1024 * 1024;
  log('saveDataTestUser');
  for (let i = 0; i < 100; i++) {
    log('generateRandomData');
    const randomData = generateRandomData(megabyte);
    const before = new Date().getTime();
    // await sendPost('/v1/user/save-data', geesomeClient.apiKey, JSON.stringify({
    //   content: randomData,
    //   fileName: 'text.txt',
    // }))
    const textContent = await geesomeClient.saveContentData(randomData, {
      fileName: 'text.txt'
    });
    const after = new Date().getTime();
    // const contentObj = await app.storage.getObject(textContent.manifestStorageId);
    log(after - before);
  }
})().catch(e => {
  console.error('catch', e);
});


function sendPost(path, apiKey, data) {
  return new Promise((resolve, reject) => {
    const options = {
      path,
      hostname: 'localhost',
      port: 7711,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': 'Bearer ' + apiKey
      }
    }

    const req = http.request(options, resp => {
      console.log(`statusCode: ${resp.statusCode}`)
      let data = '';
      resp.on('data', (chunk) => {
        data += chunk;
      });
      resp.on('end', () => resolve(JSON.parse(data)));
    });

    req.on('error', error => {
      reject(error)
    });

    req.write(data);
    req.end();
  })
}