import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceView} from '../app/modules/socNetPublishing/sources.ts';

test('source metadata distinguishes API publication queues without exposing their intent', () => {
 const group = {id: 7, name: 'queue-test', title: 'Creator queue', propertiesJson: JSON.stringify({localPublishingSource: 'a'.repeat(64), secret: 'private'})};
 assert.deepEqual(sourceView(group), {id: 7, name: 'queue-test', title: 'Creator queue', lastPostAt: null, isPublicationQueue: true});
 for (const propertiesJson of [undefined, '{}', '{broken', 'null', JSON.stringify({localPublishingSource: 'not-an-intent'}), JSON.stringify({localPublishingSource: 123})]) {
  assert.equal(sourceView({...group, propertiesJson}).isPublicationQueue, false);
 }
 assert.equal(sourceView({...group, propertiesJson: '{}', name: 'queue-' + 'a'.repeat(32)}).isPublicationQueue, false, 'names do not authorize automatic routing');
});
