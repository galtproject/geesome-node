import assert from 'node:assert';

import {ActivityPubObjectReviewState} from '../app/modules/activityPub/interface.js';
import {activityPubPublicCollection} from '../app/modules/activityPub/helpers.js';
import {createActivityPubSmokeHarness} from './helpers/activityPubSmokeHarness.js';
import {getSmokeReportPathEnvDescription, printSmokeReport as writeSmokeReport} from './helpers/smokeReport.js';

const defaultResource = 'acct:Mastodon@mastodon.social';
const defaultTimeoutMs = 15000;
const defaultMaxCollectionItems = 20;
const smokeGroupName = 'test-channel';
const smokeReviewerUserId = 7;
const smokeReportPathEnvName = 'ACTIVITYPUB_REMOTE_SMOKE_REPORT_PATH';

async function run(): Promise<void> {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const options = getSmokeOptions();
  const warnings: string[] = [];
  const discovery = await discoverActivityPubActor(options);
  if (!discovery.actorUrl) {
    printSmokeSkip(options, 'activitypub_remote_actor_not_discoverable', {
      discovery,
      warnings
    });
    return;
  }

  const actor = await fetchActivityPubJson(discovery.actorUrl, options);
  assertRemoteActivityPubActor(actor);
  const note = await fetchRemotePublicNote(options, actor, warnings);
  if (!note) {
    printSmokeSkip(options, 'activitypub_remote_public_note_not_available', {
      discovery,
      actor: getActorReport(actor),
      warnings
    });
    return;
  }

  const moduleSmoke = await runActivityPubModuleSmoke(actor, note);
  printSmokeReport({
    ok: true,
    skipped: false,
    resource: options.resource,
    discovery,
    actor: getActorReport(actor),
    remoteNote: getNoteReport(note),
    moduleSmoke,
    warnings
  });
}

async function discoverActivityPubActor(options) {
  if (options.actorUrl) {
    return {
      source: 'actor-url',
      actorUrl: options.actorUrl
    };
  }

  const webFingerUrl = getWebFingerUrl(options.resource);
  const webFinger = await fetchJson(webFingerUrl, options, {
    accept: 'application/jrd+json, application/json',
    allowMissing: true
  });
  return {
    source: 'webfinger',
    resource: options.resource,
    webFingerUrl,
    actorUrl: getActivityPubSelfLink(webFinger)
  };
}

async function fetchRemotePublicNote(options, actor, warnings: string[]) {
  const featuredNote = await fetchFirstFeaturedNote(options, actor, warnings);
  if (featuredNote) {
    return featuredNote;
  }
  return fetchFirstOutboxNote(options, actor, warnings);
}

async function fetchFirstFeaturedNote(options, actor, warnings: string[]) {
  const featured = await fetchCollectionValue(actor.featured, options, warnings, 'activitypub_actor_featured_unavailable');
  if (!featured) {
    return null;
  }
  const note = await fetchFirstCollectionNote(featured, options, 'actor-featured');
  if (!note) {
    warnings.push('activitypub_actor_featured_has_no_public_note');
  }
  return note;
}

async function fetchFirstOutboxNote(options, actor, warnings: string[]) {
  const outbox = await fetchCollectionValue(actor.outbox, options, warnings, 'activitypub_actor_outbox_unavailable');
  if (!outbox) {
    return null;
  }
  const firstPage = await fetchCollectionFirstPage(outbox, options, warnings);
  const note = await fetchFirstCollectionNote(firstPage || outbox, options, 'actor-outbox');
  if (!note) {
    warnings.push('activitypub_actor_outbox_has_no_public_note');
  }
  return note;
}

async function fetchCollectionValue(value, options, warnings: string[], warningName: string) {
  if (!value) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return await fetchActivityPubJson(value, options, {allowMissing: true});
  } catch (e) {
    warnings.push(`${warningName}:${getErrorMessage(e)}`);
    return null;
  }
}

async function fetchCollectionFirstPage(collection, options, warnings: string[]) {
  if (!collection?.first) {
    return null;
  }
  return fetchCollectionValue(collection.first, options, warnings, 'activitypub_collection_first_unavailable');
}

async function fetchFirstCollectionNote(collection, options, source: string) {
  const items = getCollectionItems(collection).slice(0, options.maxCollectionItems);
  for (const item of items) {
    const note = await fetchItemNote(item, options, source);
    if (note) {
      return note;
    }
  }
  return null;
}

async function fetchItemNote(item, options, source: string) {
  const itemObject = typeof item === 'string'
    ? await fetchActivityPubJson(item, options, {allowMissing: true})
    : item;
  const note = await getNoteFromActivityPubObject(itemObject, options);
  if (!isUsableActivityPubNote(note)) {
    return null;
  }
  return {
    ...note,
    geesomeSmokeSource: source
  };
}

async function getNoteFromActivityPubObject(value, options) {
  if (!value) {
    return null;
  }
  if (value.type === 'Note') {
    return value;
  }
  if (value.type !== 'Create') {
    return null;
  }
  if (typeof value.object === 'string') {
    return fetchActivityPubJson(value.object, options, {allowMissing: true});
  }
  return value.object;
}

async function runActivityPubModuleSmoke(actor, note) {
  const harness = await createActivityPubSmokeHarness({remoteActorDocument: actor});
  const localActor = await harness.module.getGroupActor(smokeGroupName);
  const createActivity = getTargetedCreateActivity(actor, note, localActor.id);
  const firstResult = await harness.module.handleSharedInboxRequest(
    harness.signSharedInboxActivity(createActivity)
  );
  const secondResult = await harness.module.handleSharedInboxRequest(
    harness.signSharedInboxActivity(createActivity)
  );
  const remoteActorRecord = harness.models.ActivityPubRemoteActor.rows[0];
  const remoteObjectRecord = harness.models.ActivityPubObject.rows.find((row) => row.origin === 'remote');

  assert.equal(firstResult.ok, true);
  assert.equal(firstResult.accepted, true);
  assert.equal(firstResult.message, 'activitypub_create_object_recorded');
  assert.equal(secondResult.activityPubObjectId, firstResult.activityPubObjectId);
  assert.equal(remoteActorRecord.actorUrl, actor.id);
  assert.equal(remoteObjectRecord.objectId, note.id);
  assert.equal(remoteObjectRecord.remoteActorId, remoteActorRecord.id);

  const pendingObject = await harness.module.getGroupRemoteObject(smokeGroupName, remoteObjectRecord.id);
  const pendingDraft = await harness.module.getGroupRemoteObjectPostDraft(smokeGroupName, remoteObjectRecord.id);
  assert.equal(pendingObject.reviewState, ActivityPubObjectReviewState.Pending);
  assert.equal(pendingDraft.canCreatePost, false);
  assert.deepEqual(pendingDraft.reasons, ['activitypub_remote_object_review_not_accepted']);
  assert.equal(pendingDraft.remoteObject.objectId, note.id);

  const acceptedObject = await harness.module.setGroupRemoteObjectReviewState(smokeGroupName, remoteObjectRecord.id, {
    state: ActivityPubObjectReviewState.Accepted
  }, smokeReviewerUserId);
  const acceptedDraft = await harness.module.getGroupRemoteObjectPostDraft(smokeGroupName, remoteObjectRecord.id);
  const postCreateResult = await harness.module.createGroupRemoteObjectPost(
    smokeGroupName,
    remoteObjectRecord.id,
    smokeReviewerUserId
  );

  assert.equal(acceptedObject.reviewState, ActivityPubObjectReviewState.Accepted);
  assert.equal(acceptedDraft.canCreatePost, true);
  assert.equal(postCreateResult.post.isRemote, true);
  assert.equal(postCreateResult.remoteObject.localPostId, postCreateResult.post.id);
  assert.equal(harness.calls.saveData.length, 1);
  assert.equal(harness.calls.createRemotePostByObject.length, 1);

  return {
    localActorUrl: localActor.id,
    inboxResult: {
      message: firstResult.message,
      activityType: firstResult.activityType,
      objectId: firstResult.objectId,
      activityPubObjectId: firstResult.activityPubObjectId,
      idempotent: secondResult.activityPubObjectId === firstResult.activityPubObjectId
    },
    remoteActor: {
      id: remoteActorRecord.id,
      actorUrl: remoteActorRecord.actorUrl,
      publicKeyId: remoteActorRecord.publicKeyId,
      preferredUsername: remoteActorRecord.preferredUsername,
      sharedInboxUrl: remoteActorRecord.sharedInboxUrl
    },
    remoteObject: {
      id: remoteObjectRecord.id,
      objectId: remoteObjectRecord.objectId,
      objectType: remoteObjectRecord.objectType,
      visibility: remoteObjectRecord.visibility,
      reviewState: acceptedObject.reviewState,
      canCreatePost: acceptedDraft.canCreatePost,
      contentText: acceptedDraft.contentText,
      createdPostId: postCreateResult.post.id
    },
    savedContents: harness.calls.saveData.length,
    createdPosts: harness.calls.createRemotePostByObject.length
  };
}

async function fetchActivityPubJson(url: string, options, fetchOptions: any = {}) {
  return fetchJson(url, options, {
    accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/ld+json, application/json',
    ...fetchOptions
  });
}

async function fetchJson(url: string, options, fetchOptions: any = {}) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: fetchOptions.accept || 'application/json'
      },
      signal: abortController.signal
    });
    if ((response.status === 404 || response.status === 410) && fetchOptions.allowMissing) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`fetch_failed:${response.status}:${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function getTargetedCreateActivity(actor, note, localActorUrl: string) {
  const targetedNote = {
    ...note,
    attributedTo: actor.id,
    to: uniqueValues([...getReferenceValues(note.to), activityPubPublicCollection, localActorUrl]),
    cc: uniqueValues(getReferenceValues(note.cc)),
    tag: [
      ...getArrayValues(note.tag),
      {
        type: 'Mention',
        href: localActorUrl,
        name: `@${smokeGroupName}@example.com`
      }
    ]
  };

  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${note.id}#geesome-remote-smoke-create`,
    type: 'Create',
    actor: actor.id,
    to: targetedNote.to,
    cc: targetedNote.cc,
    object: targetedNote
  };
}

function getSmokeOptions() {
  const actorUrl = normalizeOptionalUrl(process.env.ACTIVITYPUB_REMOTE_SMOKE_ACTOR_URL);
  const resource = normalizeResource(process.env.ACTIVITYPUB_REMOTE_SMOKE_RESOURCE || defaultResource);
  return {
    actorUrl,
    resource,
    timeoutMs: parsePositiveInteger(process.env.ACTIVITYPUB_REMOTE_SMOKE_TIMEOUT_MS, defaultTimeoutMs),
    maxCollectionItems: parsePositiveInteger(process.env.ACTIVITYPUB_REMOTE_SMOKE_MAX_COLLECTION_ITEMS, defaultMaxCollectionItems)
  };
}

function getWebFingerUrl(resource: string): string {
  const domain = getWebFingerResourceDomain(resource);
  const url = new URL('/.well-known/webfinger', `https://${domain}`);
  url.searchParams.set('resource', resource);
  return url.toString();
}

function getWebFingerResourceDomain(resource: string): string {
  const match = resource.match(/^acct:[^@]+@([^@]+)$/i);
  if (!match?.[1]) {
    throw new Error('activitypub_remote_smoke_resource_invalid');
  }
  return match[1].toLowerCase();
}

function normalizeResource(value: string): string {
  const resource = value.trim();
  if (!resource) {
    throw new Error('activitypub_remote_smoke_resource_required');
  }
  if (resource.startsWith('acct:')) {
    return resource;
  }
  return `acct:${resource.replace(/^@/, '')}`;
}

function normalizeOptionalUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return new URL(trimmed).toString();
}

function assertRemoteActivityPubActor(actor): void {
  assert.equal(typeof actor?.id, 'string');
  assert.equal(actor.id.length > 0, true);
  assert.equal(typeof actor.type, 'string');
  assert.equal(typeof actor.inbox, 'string');
  if (actor.outbox !== undefined) {
    assert.equal(typeof actor.outbox, 'string');
  }
}

function getActivityPubSelfLink(webFinger): string | null {
  const link = (webFinger?.links || []).find((item) => {
    return item?.rel === 'self' && isActivityPubContentType(item?.type) && typeof item?.href === 'string';
  });
  return link?.href || null;
}

function getCollectionItems(collection): any[] {
  return getArrayValues(collection?.orderedItems || collection?.items);
}

function isUsableActivityPubNote(note): boolean {
  if (note?.type !== 'Note') {
    return false;
  }
  if (typeof note.id !== 'string' || !note.id) {
    return false;
  }
  if (typeof note.content !== 'string' || !note.content) {
    return false;
  }
  const recipients = [...getReferenceValues(note.to), ...getReferenceValues(note.cc)];
  return recipients.includes(activityPubPublicCollection);
}

function isActivityPubContentType(value: string | undefined): boolean {
  return String(value || '').includes('application/activity+json')
    || String(value || '').includes('https://www.w3.org/ns/activitystreams');
}

function getReferenceValues(value): string[] {
  if (typeof value === 'string' && value) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => getReferenceValues(item));
  }
  if (typeof value?.id === 'string' && value.id) {
    return [value.id];
  }
  return [];
}

function getArrayValues(value): any[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function getActorReport(actor) {
  return {
    id: actor.id,
    type: actor.type,
    preferredUsername: actor.preferredUsername,
    inbox: actor.inbox,
    outbox: actor.outbox,
    sharedInbox: actor.endpoints?.sharedInbox
  };
}

function getNoteReport(note) {
  return {
    id: note.id,
    attributedTo: note.attributedTo,
    published: note.published,
    source: note.geesomeSmokeSource
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function getErrorMessage(error): string {
  return error?.message || String(error);
}

function printSmokeSkip(options, reason: string, extra: any = {}): void {
  printSmokeReport({
    ok: true,
    skipped: true,
    reason,
    resource: options.resource,
    actorUrl: options.actorUrl,
    ...extra
  });
}

function printSmokeReport(report): void {
  writeSmokeReport(report, smokeReportPathEnvName);
}

function printUsage(): void {
  console.log(`Usage:
  npm run activitypub:remote-server-smoke
  ACTIVITYPUB_REMOTE_SMOKE_RESOURCE=acct:Mastodon@mastodon.social npm run activitypub:remote-server-smoke
  ACTIVITYPUB_REMOTE_SMOKE_ACTOR_URL=https://mastodon.social/@Mastodon npm run activitypub:remote-server-smoke

Fetches a public ActivityPub actor from a real Fediverse server, checks actor
discovery and a public Note when available, then feeds a signed fixture-equivalent
Create(Note) through the GeeSome activityPub module using an in-memory disposable
local group. Missing public notes are reported as a clear skip.

Environment:
  ACTIVITYPUB_REMOTE_SMOKE_RESOURCE              WebFinger resource, default acct:Mastodon@mastodon.social
  ACTIVITYPUB_REMOTE_SMOKE_ACTOR_URL             Direct actor URL; skips WebFinger when set
  ACTIVITYPUB_REMOTE_SMOKE_TIMEOUT_MS            Fetch timeout, default 15000
  ACTIVITYPUB_REMOTE_SMOKE_MAX_COLLECTION_ITEMS  Max featured/outbox items to inspect, default 20
  ${getSmokeReportPathEnvDescription(smokeReportPathEnvName)}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
