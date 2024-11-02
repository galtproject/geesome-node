/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export {};

const http = require('http');

const hostname = process.env.HOST || 'localhost';
const isHttps = !(hostname === 'localhost' || isIpAddress(hostname));
const port = isHttps ? 7722 : 7711;

(async () => {
  const GeesomeClient = (await import("geesome-libs/src/GeesomeClient.js")).default;
  const geesomeClient = new GeesomeClient({ server: (isHttps ? 'https' : 'http') + '://' + hostname + ':' + port, apiKey: process.env.API_KEY });

  await geesomeClient.init();

  console.log('node address', await geesomeClient.getNodeAddressList());
  console.log('boot nodes', await geesomeClient.adminGetBootNodes());

  const allGroups = await geesomeClient.getAdminInChannels();

  let testGroup = allGroups.filter(i => i.name === 'test')[0];
  if (!testGroup) {
    testGroup = await geesomeClient.createGroup({name: 'test', title: 'Test', type: 'channel', isPublic: true});
  }

  while (true) {
    const text = 'test ' + Math.random();
    const textContent = await geesomeClient.saveContentData(text, {
      groupId: testGroup.id,
      mimeType: 'text/markdown'
    });

    console.log('send', text);
    await geesomeClient.createPost({contents: [textContent.id].map(id => ({id})), groupId: testGroup.id || testGroup.staticId, status: 'published'});
  }
})().catch(e => {
  console.error('catch', e);
});


function sendPost(path, apiKey, data) {
  return new Promise((resolve, reject) => {
    const options = {
      path,
      hostname,
      port,
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
function isIpAddress(str) {
  return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(str);
}