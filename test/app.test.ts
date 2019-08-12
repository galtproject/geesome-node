/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {IGeesomeApp} from "../components/app/interface";
import {UserLimitName} from "../components/database/interface";

const assert = require('assert');
const fs = require('fs');

describe("app", function () {
  const databaseConfig = {name: 'test_geesome_core', options: {logging: true}};

  this.timeout(30000);

  let app: IGeesomeApp;

  const versions = ['v1'];//'ipfs-http-client'

  versions.forEach((appVersion) => {
    describe('app ' + appVersion, () => {
      before(async () => {
        const appConfig = require('../components/app/v1/config');
        const database = await require('../components/database/' + appConfig.databaseModule)({config: {databaseConfig}});
        await database.flushDatabase();

        try {
          app = await require('../components/app/' + appVersion)({databaseConfig});
        } catch (e) {
          console.error(e);
          assert.equal(true, false);
        }
      });

      it("should initialized successfully", async () => {
        assert.notEqual(await app.database.getUsersCount(), 0);

        await new Promise((resolve, reject) => {
          fs.writeFile('/tmp/test', 'test', resolve);
        });
        const resultFile = await app.storage.saveFileByPath('/tmp/test');

        assert.notEqual(resultFile.storageAccountId, null);

        const adminUser = (await app.database.getAllUserList('admin'))[0];
        const testUser = (await app.database.getAllUserList('test'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const limitData = {
          name: UserLimitName.SaveContentSize,
          value: 100 * (10 ** 3),
          adminId: adminUser.id,
          userId: testUser.id,
          periodTimestamp: 60,
          isActive: true
        };
        await app.setUserLimit(adminUser.id, limitData);

        try {
          await app.saveData(fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
            userId: testUser.id,
            groupId: testGroup.id
          })
          assert.equal(true, false);
        } catch (e) {
          assert.equal(true, true);
        }

        limitData.value = 1000 * (10 ** 3);

        await app.setUserLimit(adminUser.id, limitData);

        await app.saveData(fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
          userId: testUser.id,
          groupId: testGroup.id
        })

        // const contentObj = await app.saveDataByUrl('https://www.youtube.com/watch?v=rxGnonKB7TY', {userId: 1, groupId: 1, driver: 'youtube-video'});
        // console.log('contentObj', contentObj);
        //
        // assert.notEqual(contentObj.storageAccountId, null);
      });
    });
  });
});
