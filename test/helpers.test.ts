import assert from 'assert';
import helpers from '../app/helpers.js';

describe('helpers', () => {
	it('sanitizes list params before they reach Sequelize queries', () => {
		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'createdAt;DROP',
			sortDir: 'sideways',
			limit: '-5' as any,
			offset: '-10' as any
		}), {
			sortBy: 'createdAt',
			sortDir: 'DESC'
		});

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'publishedAt',
			sortDir: 'asc',
			limit: '10001' as any,
			offset: '7' as any
		}), {
			sortBy: 'publishedAt',
			sortDir: 'ASC',
			limit: 10000,
			offset: 7
		});
	});

	it('applies endpoint list sort allowlists and caps', () => {
		const publicPostOptions = {
			sortBy: 'publishedAt',
			allowedSortBy: ['publishedAt', 'updatedAt', 'createdAt', 'id'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'name',
			sortDir: 'asc',
			limit: '10000' as any,
			offset: '2' as any
		}, publicPostOptions), {
			sortBy: 'publishedAt',
			sortDir: 'ASC',
			limit: 100,
			offset: 2
		});

		const fileCatalogOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'id', 'position', 'name'],
			maxLimit: 200
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'position',
			sortDir: 'desc',
			limit: '500' as any
		}, fileCatalogOptions), {
			sortBy: 'position',
			sortDir: 'DESC',
			limit: 200
		});

		const categoryManagementOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'unsafeColumn',
			sortDir: 'asc',
			limit: '250' as any
		}, categoryManagementOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const userUtilityOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'updatedAt',
			sortDir: 'desc',
			limit: '1000' as any
		}, userUtilityOptions), {
			sortBy: 'updatedAt',
			sortDir: 'DESC',
			limit: 100
		});

		const inviteOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'code', 'isActive'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'permissions',
			sortDir: 'asc',
			limit: '500' as any
		}, inviteOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const apiKeyOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'title', 'expiredOn', 'isDisabled'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'permissions',
			sortDir: 'desc',
			limit: '500' as any
		}, apiKeyOptions), {
			sortBy: 'createdAt',
			sortDir: 'DESC',
			limit: 100
		});

		const adminDirectoryOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'email', 'storageAccountId'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'passwordHash',
			sortDir: 'asc',
			limit: '500' as any
		}, adminDirectoryOptions), {
			sortBy: 'createdAt',
			sortDir: 'ASC',
			limit: 100
		});

		const userGroupOptions = {
			sortBy: 'createdAt',
			allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'title', 'type'],
			maxLimit: 100
		};

		assert.deepEqual(helpers.prepareListParams({
			sortBy: 'isDeleted',
			sortDir: 'desc',
			limit: '500' as any
		}, userGroupOptions), {
			sortBy: 'createdAt',
			sortDir: 'DESC',
			limit: 100
		});
	});
});
