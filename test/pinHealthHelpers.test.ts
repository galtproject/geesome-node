import assert from 'node:assert';
import {
	getPinAccountHealthResponse,
	getPinStorageObjectHealthAttributes
} from '../app/modules/pin/healthHelpers.js';

describe('pin health helpers', function () {
	it('projects bounded ledger health without raw provider results', () => {
		const response = getPinAccountHealthResponse(
			{id: 4, service: 'pinata'},
			{
				totalCount: '2',
				confirmedCount: '1',
				terminalFailureCount: '1',
				dueReconciliationCount: '1',
				activeClaimCount: '0'
			},
			{
				storageId: 'failed-storage',
				status: 'terminal_failure',
				lastErrorCode: 'invalid_object',
				lastErrorMessage: 'invalid object'
			},
			[{
				storageId: 'confirmed-storage',
				status: 'confirmed',
				attemptCount: '1',
				reconcileAttemptCount: '2',
				resultJson: JSON.stringify({provider: 'private diagnostics'})
			}]
		);

		assert.equal(response.accountId, 4);
		assert.equal(response.statusCounts.confirmed, 1);
		assert.equal(response.statusCounts.terminalFailure, 1);
		assert.equal(response.lastError.code, 'invalid_object');
		assert.equal((response.recent[0] as any).resultJson, undefined);
		assert.equal(getPinStorageObjectHealthAttributes().includes('resultJson'), false);
	});
});
