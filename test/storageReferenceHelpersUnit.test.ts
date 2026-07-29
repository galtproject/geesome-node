import assert from 'node:assert';
import {Op} from 'sequelize';
import {countDerivedStorageIdReferences} from '../app/modules/database/storageReferenceHelpers.js';

describe('storage reference helpers', () => {
	it('counts storage reference sources registered by product modules', async () => {
		const storageId = 'attachment-storage-id';
		const referenceModel = {
			count: async ({where}) => {
				assert.deepEqual(where[Op.or], [{storageId}]);
				return 2;
			}
		};

		const count = await countDerivedStorageIdReferences(
			{},
			{models: {}},
			storageId,
			{},
			[{model: referenceModel, columns: ['storageId']}]
		);

		assert.equal(count, 2);
	});
});
