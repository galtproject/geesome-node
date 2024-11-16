/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import GeesomeClient from "geesome-libs/src/GeesomeClient";
import http from 'http';
import fs from 'fs';

const hostname = process.env.HOST || 'localhost';
const isHttps = !(hostname === 'localhost' || isIpAddress(hostname));
const port = isHttps ? 2053 : 2052;

(async () => {
  let apiKey = process.env.API_KEY;
  const server = (isHttps ? 'https' : 'http') + '://' + hostname + ':' + port;
  console.log('server', server);
  const geesomeClient = new GeesomeClient({ server, apiKey });

  if (!apiKey) {
    ({apiKey} = await geesomeClient.setup({
      name: 'test',
      email: 'test@test.com',
      password: 'test'
    }));
    console.log('apiKey', apiKey);
  }
  geesomeClient.setApiKey(apiKey);

  const promises = fs.readdirSync(process.env.DIR_PATH).map(fileName => {
    console.log('fileName', fileName);
    return geesomeClient.saveContentData(fs.readFileSync(`${process.env.DIR_PATH}/${fileName}`), {fileName});
  })

  const contentList = await Promise.all(promises);

  let userQueueOperation = await geesomeClient.staticSiteRunGenerate({entityType: 'content-list', entityIds: contentList.map(c => c.id)}, {
    site: {
      title: new Date().toISOString().slice(0, 19).replace('T', " "),
      name: 'test-' + new Date().getTime()
    },
    stylesCss: `
      #app {
        background: #f8fafe;
      }
      #app .content-list {
        background: white;
        border-radius: 30px;
      }
      .page-header {
        display: flex;
        padding: 15px 15px 0;
        justify-content: space-between;
      }
      .powered {
        display: flex;
        align-items: flex-end;
        padding-bottom: 15px;
      }
      .powered a {
        color: black;
      }
      .page-header .page-header-content {
        display: flex;
        align-items: center;
        background: #e8eff6;
        border-radius: 20px;
        padding: 10px;
        margin-bottom: 15px;
      }
      .page-header .page-header-content img {
        margin-right: 10px;
        height: 70px;
        border-radius: 100%;
      }
      .page-header .page-header-content .header-title {
        display: flex;
        flex-direction: column;
      }
      .page-header .page-header-content a.header-title {
        color: black;
      }
      .page-header .page-header-content a.header-title {
        text-decoration: none;
      }
      .page-header .page-header-content a.header-title:hover {
        text-decoration: underline;
      }
      .page-header .page-header-content .header-title span:last-child {
        opacity: 0.5;
        margin-top: 5px;
      }
    `,
    headerHtml: `
        <img src="https://pbs.twimg.com/profile_images/1822945229080555520/copOugBN_400x400.jpg">
        <a href="https://microwavegirls.com/" target="_blank" class="header-title"><span>Microwave Girls</span><span>@MicrowaveGirls</span></a>
    `,
    footerHtml: ''
  });

  do {
    userQueueOperation = await geesomeClient.getOperationQueueItem(userQueueOperation.id);
  } while(!userQueueOperation.asyncOperation || userQueueOperation.asyncOperation.inProcess);
  console.log('userQueueOperation', userQueueOperation);
  const {output} = userQueueOperation.asyncOperation;
  console.log('link:', geesomeClient.getContentLinkByStorageId(JSON.parse(output).storageId, true));
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