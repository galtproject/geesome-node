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
});
