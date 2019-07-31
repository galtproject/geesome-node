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

import {IStorage} from "../components/storage/interface";

const assert = require('assert');

const appConfig = require('../components/app/v1/config');
const CID = require('cids');

describe("storage", function () {
  this.timeout(30000);

  let storage: IStorage;

  const storages = ['js-ipfs'];//'ipfs-http-client'

  storages.forEach((storageService) => {
    describe(storageService + ' storage', () => {
      before(async () => {
        storage = await require('../components/storage/' + storageService)({
          config: appConfig
        });
      });

      it("should save and get objects correctly", async () => {
        const obj = {
          foo: 'bar',
          fooArray: ['bar1', 'bar2']
        };
        const objectId = await storage.saveObject(obj);

        assert.deepEqual(await storage.getObject(objectId), obj);

        assert.equal(await storage.getObjectProp(objectId, 'foo'), 'bar');

        assert.equal(await storage.getObjectProp(objectId, 'fooArray/0'), 'bar1');
      });

      it("should save and get remote objects correctly", async () => {
        const array = ['bar1', 'bar2'];
        const arrayId = await storage.saveObject(array);

        const obj = {
          foo: 'bar',
          fooArray: {
            '/': arrayId
          }
        };
        const objectId = await storage.saveObject(obj);

        console.log('await storage.getObject(objectId)', await storage.getObject(objectId))
        // assert.deepEqual(await storage.getObject(objectId), {
        //     foo: 'bar',
        //     fooArray: ['bar1', 'bar2']
        // });

        assert.deepEqual(await storage.getObjectProp(objectId, 'fooArray'), array);
      });

      it("should allow to bind id to static", async () => {
        const array = ['bar1', 'bar2'];
        const arrayId = await storage.saveObject(array);

        const staticId = await storage.bindToStaticId(arrayId, 'self');

        assert.equal(await storage.resolveStaticId(staticId), arrayId)
      });

      it("should create account if not exists", async () => {
        await storage.removeAccountIfExists('new-key');

        assert.equal(await storage.getAccountIdByName('new-key'), null);

        let accountId = await storage.createAccountIfNotExists('new-key');

        assert.notEqual(accountId, null);

        let sameAccountId = await storage.getAccountIdByName('new-key');

        assert.equal(accountId, sameAccountId);

        await storage.createAccountIfNotExists('new-key');
        sameAccountId = await storage.getAccountIdByName('new-key');

        assert.equal(accountId, sameAccountId);

        await storage.removeAccountIfExists('new-key');

        assert.equal(await storage.getAccountIdByName('new-key'), null);
      });
    });
  });
});
