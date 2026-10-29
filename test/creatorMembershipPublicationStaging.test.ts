import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {publicationStagingPath, parsePublicationStagingPath} from '../app/modules/staticSiteGenerator/membershipPublicationStaging.js';

describe('membership publication staging ownership boundary', () => {
	it('preserves the existing path format and identifies both variant owners', () => {
		const jobId = randomUUID(), leaseToken = randomUUID();
		for (const variant of ['public', 'full']) {
			const path = publicationStagingPath(jobId, leaseToken, variant);
			assert.equal(path, `/membership-${jobId}-${leaseToken}-${variant}`);
			assert.deepEqual(parsePublicationStagingPath(path, jobId), {jobId, leaseToken, variant});
		}
	});
	it('rejects other jobs, malformed paths and paths outside the staging namespace', () => {
		const jobId = randomUUID(), token = randomUUID();
		const valid = `/membership-${jobId}-${token}-public`;
		assert.throws(() => parsePublicationStagingPath(valid, randomUUID()), /invalid_publication_staging_path/);
		for (const path of [valid + '/media', valid + '/..', valid + '-extra', valid.replace('-public', '-private'), valid.replace('/membership-', '/other-'), '/membership-invalid-public', undefined]) {
			assert.throws(() => parsePublicationStagingPath(path), /invalid_publication_staging_path/);
		}
	});
});
