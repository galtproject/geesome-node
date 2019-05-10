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

import {IDatabase} from "../components/database/interface";

const assert = require('assert');

describe("databaseValues", function () {
    const debugDatabase = false;
    const databaseName = 'test_geesome_core';
    
    let database: IDatabase;

    const databases = ['mysql'];

    databases.forEach((databaseService) => {
        describe(databaseService + ' database', () => {
            before(async () => {
                database = await require('../components/database/' + databaseService)({ name: databaseName, options: {logging: debugDatabase} });
            });

            after(async () => {
                await database.flushDatabase();
            });
            
            it("should set and get values correctly", async () => {
                assert.strictEqual(await database.getValue('test1'), null);
                
                await database.setValue('test1', 'test1Value');
                
                assert.strictEqual(await database.getValue('test1'), 'test1Value');

                await database.setValue('test1', 'test1ValueNew');
                
                assert.strictEqual(await database.getValue('test1'), 'test1ValueNew');

                assert.strictEqual(await database.getValue('test2'), null);
                
                await database.setValue('test2', 'test2Value');
                assert.strictEqual(await database.getValue('test2'), 'test2Value');

                assert.strictEqual(await database.getValue('test1'), 'test1ValueNew');

                await database.clearValue('test1');

                assert.strictEqual(await database.getValue('test1'), null);
                assert.strictEqual(await database.getValue('test2'), 'test2Value');
                
                await database.clearValue('test2');
                
                assert.strictEqual(await database.getValue('test2'), null);
            });
        });
    });
});
