import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeSourceImageSet, validateSourceImageSet} from '../app/modules/socNetPublishing/sourceImageSet.js';
import {getOutboxMethods} from '../app/modules/socNetPublishing/outbox.js';
import {publicationIntentDigest} from '../app/modules/socNetPublishing/producer.js';

describe('publication source image set', () => {
	it('requires an exact numeric reference without URLs or extra properties', () => {
		assert.deepEqual(normalizeSourceImageSet({postId: 2, groupId: 1}), {groupId: 1, postId: 2});
		for (const value of [null, {}, [], {groupId: '1', postId: 2}, {groupId: 1, postId: -2}, {groupId: 1, postId: 2, url: '/secret'}]) {
			assert.throws(() => normalizeSourceImageSet(value), {status: 400});
		}
	});
	it('accepts only an owned published visible membership source', async () => {
		const post = {id: 42, userId: 7, groupId: 10, status: 'published', propertiesJson: JSON.stringify({membership: {title: 'Collection'}}),
			group: {id: 10, creatorId: 7, isPublic: false}};
		const app = {ms: {group: {getPost: async () => post}}};
		assert.deepEqual(await validateSourceImageSet(app, 7, {groupId: 10, postId: 42}), {groupId: 10, postId: 42});
		for (const change of [{userId: 8}, {groupId: 11}, {isDeleted: true}, {status: 'draft'}, {propertiesJson: '{'}, {propertiesJson: JSON.stringify({membership: {hidden: true}})}]) {
			const original = {...post};Object.assign(post, change);
			await assert.rejects(validateSourceImageSet(app, 7, {groupId: 10, postId: 42}), {status: 403});
			Object.assign(post, original);delete post.isDeleted;
		}
	});
	it('preserves legacy digests and binds the optional source reference', () => {
		const intent = {contentType: 'sfw', destinationId: 3, executionMode: 'native', network: 'geesome', target: {groupId: 20}};
		const payload = {text: 'Frozen', attachments: []};
		const legacy = createHash('sha256').update(JSON.stringify({version: 6, contentType: 'sfw', destinationId: 3, executionMode: 'native', accountIdentity: null, clientId: null,
			network: 'geesome', localAccountId: null, text: 'Frozen', attachments: [], target: {groupId: 20}})).digest('hex');
		assert.equal(publicationIntentDigest(intent, payload), legacy);
		const linked = publicationIntentDigest(intent, {...payload, sourceImageSet: {groupId: 10, postId: 42}});
		assert.notEqual(linked, legacy);
		assert.notEqual(linked, publicationIntentDigest(intent, {...payload, sourceImageSet: {groupId: 10, postId: 43}}));
	});
});


describe('outbox capability compatibility', () => {
	it('advertises Image set links and destination intervals for empty and populated source selections', async () => {
		const group = {id: 10, creatorId: 7, name: 'local-publications-7', type: 'channel', isPublic: false, isOpen: false,
			propertiesJson: JSON.stringify({localPublishingOutbox: 'local-publications-v1'})};
		const sequelize = {getQueryInterface: () => ({queryGenerator: {quoteTable: () => 'publication_jobs'}})};
		for (const mode of ['no-source', 'missing-selected-source', 'managed-source']) {
			const app: any = {ms: {database: {models: {Group: {findAll: async () => []}, Post: {findAll: async () => []}}},
				group: {getGroupByParams: async () => mode === 'managed-source' ? group : null}}};
			const methods = getOutboxMethods(app, {sequelize, getTableName: () => 'publication_jobs'}, {
				boundedInteger: value => Number(value), groupIds: value => value
			});
			const result = await methods.getOutbox(7, mode === 'missing-selected-source' ? {groupIds: [999]} : {});
			assert.equal(result.capabilities.sourceImageSetLinks, true, mode);
			assert.equal(result.capabilities.destinationScheduleDefaults, true, mode);
		}
	});
});
