/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import {IGeesomeDatabaseModule} from "../app/modules/database/interface.js";

describe("databaseValues", function () {
	let database: IGeesomeDatabaseModule;

	before(async () => {
		database = await (await import('../app/modules/database/index.js')).default({config: {}} as any);
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

		await database.setValue('1 — копия.jpeg', '1 — копия.jpeg');
	});
});
