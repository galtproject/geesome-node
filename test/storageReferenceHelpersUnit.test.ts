import assert from 'node:assert';
import {Op} from 'sequelize';
import {countDerivedStorageIdReferences, countStorageObjectChildReferences} from '../app/modules/database/storageReferenceHelpers.js';

describe('storage reference helpers', () => {
    it('retirement ignores deleted Content roots but still preserves independent live roots', async () => {
        const models: any = {
            Content: {count: async ({where}) => where.isDeleted ? 0 : 1},
            StorageObjectReference: {
                findAll: async ({where}) => where.targetStorageId === 'old-preview' ? [{sourceStorageId: 'old-full'}] : [],
                count: async () => 1,
            },
        };
        assert.equal(await countStorageObjectChildReferences(models, {models: {}}, 'old-preview'), 1);
        assert.equal(await countStorageObjectChildReferences(models, {models: {}}, 'old-preview', {ignoreDeletedContentSources: true}), 0);
        models.StaticSite = {count: async () => 1};
        assert.equal(await countStorageObjectChildReferences(models, {models: {}}, 'old-preview', {ignoreDeletedContentSources: true}), 1);
    });

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
