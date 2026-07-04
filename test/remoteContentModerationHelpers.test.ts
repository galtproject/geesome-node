import assert from 'node:assert';
import {
	RemoteContentModerationAction,
	RemoteContentModerationMode,
	evaluateRemoteContentModerationPolicy,
	getRemoteContentModerationSummary,
	isRemoteContentModerationDecisionImportable,
	normalizeRemoteContentModerationPolicy
} from '../app/modules/remoteContentModeration/helpers.js';

describe('remote content moderation helpers', () => {
	it('normalizes review-first policy and evaluates keyword rules by field', () => {
		const policy = normalizeRemoteContentModerationPolicy({
			mode: 'review-first',
			rules: [
				{name: 'spam text', value: 'free coins', action: 'block'},
				{name: 'source review', field: 'source', value: 'example.social', action: 'review'}
			]
		});
		const blocked = evaluateRemoteContentModerationPolicy(policy, {
			text: 'Claim FREE COINS now',
			source: 'good.example.social',
			groupName: 'news'
		});
		const review = evaluateRemoteContentModerationPolicy(policy, {
			text: 'plain update',
			source: 'good.example.social',
			groupName: 'news'
		});
		const defaultReview = evaluateRemoteContentModerationPolicy(policy, {
			text: 'plain update',
			source: 'other.social',
			groupName: 'news'
		});

		assert.equal(policy.mode, RemoteContentModerationMode.ReviewFirst);
		assert.equal(blocked.action, RemoteContentModerationAction.Block);
		assert.equal(blocked.matches[0].name, 'spam text');
		assert.equal(review.action, RemoteContentModerationAction.Review);
		assert.equal(review.matches[0].name, 'source review');
		assert.equal(defaultReview.action, RemoteContentModerationAction.Review);
		assert.equal(isRemoteContentModerationDecisionImportable(defaultReview), false);
		assert.deepEqual(getRemoteContentModerationSummary([blocked, review, defaultReview]), {
			allowed: 0,
			review: 2,
			quarantined: 0,
			blocked: 1,
			matches: 3
		});
	});

	it('supports bounded regex rules and rejects unsafe regex shapes', () => {
		const allowed = evaluateRemoteContentModerationPolicy({
			mode: 'auto-import',
			rules: [{
				name: 'law keyword',
				type: 'regex',
				value: '\\billegal\\b',
				action: 'quarantine'
			}]
		}, {
			text: 'This mentions illegal content',
			source: 'example.social'
		});

		assert.equal(allowed.action, RemoteContentModerationAction.Quarantine);
		assert.throws(
			() => normalizeRemoteContentModerationPolicy({rules: [{type: 'regex', value: '(a+)+'}]}),
			/remote_content_moderation_regex_unsafe/
		);
		assert.throws(
			() => normalizeRemoteContentModerationPolicy({rules: [{type: 'regex', value: '('}]}),
			/remote_content_moderation_regex_invalid/
		);
	});
});
