import assert from 'node:assert';
import {ActivityPubObjectReviewState} from '../app/modules/activityPub/interface.js';
import {activityPubPublicCollection} from '../app/modules/activityPub/helpers.js';
import {createActivityPubSmokeHarness} from './helpers/activityPubSmokeHarness.js';

const defaultBlueskyHandle = 'bsky.app';
const defaultBridgeOrigin = 'https://bsky.brid.gy';
const defaultAtprotoPublicApiOrigin = 'https://public.api.bsky.app';
const defaultTimeoutMs = 15000;
const smokeGroupName = 'test-channel';
const smokeReviewerUserId = 7;

async function run(): Promise<void> {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const options = getSmokeOptions();
  const warnings: string[] = [];
  const webFinger = await fetchBridgedWebFinger(options);
  const actorUrl = getActivityPubSelfLink(webFinger);
  if (!actorUrl) {
    printSmokeSkip(options, 'activitypub_bluesky_account_not_bridge_enabled');
    return;
  }

  const actor = await fetchActivityPubJson(actorUrl, options);
  assertBridgedBlueskyActor(actor, options);
  const publicPost = await fetchLatestBlueskyPost(options, warnings);
  const bridgedNote = await fetchBridgedBlueskyNote(options, actor, publicPost, warnings);
  if (!bridgedNote) {
    printSmokeSkip(options, 'activitypub_bluesky_public_note_not_available', {
      actorUrl,
      warnings
    });
    return;
  }

  const moduleSmoke = await runActivityPubModuleSmoke(actor, bridgedNote);
  printSmokeReport({
    ok: true,
    skipped: false,
    handle: options.handle,
    bridge: {
      resource: options.resource,
      actorUrl,
      sharedInbox: actor.endpoints?.sharedInbox,
      inbox: actor.inbox,
      outbox: actor.outbox,
      publicKeyId: actor.publicKey?.id
    },
    atproto: publicPost
      ? {
        uri: publicPost.uri,
        cid: publicPost.cid,
        indexedAt: publicPost.indexedAt,
        createdAt: publicPost.record?.createdAt
      }
      : null,
    bridgedNote: {
      id: bridgedNote.id,
      published: bridgedNote.published,
      attributedTo: bridgedNote.attributedTo,
      source: bridgedNote.geesomeSmokeSource
    },
    moduleSmoke,
    warnings
  });
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

async function fetchBridgedWebFinger(options) {
  const url = new URL('/.well-known/webfinger', options.bridgeOrigin);
  url.searchParams.set('resource', options.resource);
  return fetchJson(url.toString(), options, {
    accept: 'application/jrd+json, application/json',
    allowMissing: true
  });
}

async function fetchLatestBlueskyPost(options, warnings: string[]) {
  const url = new URL('/xrpc/app.bsky.feed.getAuthorFeed', options.atprotoPublicApiOrigin);
  url.searchParams.set('actor', options.handle);
  url.searchParams.set('limit', '1');

  try {
    const feed = await fetchJson(url.toString(), options, {accept: 'application/json'});
    return feed?.feed?.[0]?.post || null;
  } catch (e) {
    warnings.push(`atproto_public_feed_unavailable:${getErrorMessage(e)}`);
    return null;
  }
}

async function fetchBridgedBlueskyNote(options, actor, publicPost, warnings: string[]) {
  if (publicPost?.uri) {
    const note = await tryFetchBridgedNote(getBridgyConvertUrl(options.bridgeOrigin, publicPost.uri), options, 'atproto-feed');
    if (note) {
      return note;
    }
    warnings.push('atproto_latest_post_bridge_convert_unavailable');
  }

  return fetchFirstActorNote(options, actor, warnings);
}

async function fetchFirstActorNote(options, actor, warnings: string[]) {
  const featuredUrls = await getActorFeaturedNoteUrls(options, actor, warnings);
  for (const noteUrl of featuredUrls) {
    const note = await tryFetchBridgedNote(noteUrl, options, 'actor-featured');
    if (note) {
      return note;
    }
  }

  const outboxUrls = await getActorOutboxNoteUrls(options, actor, warnings);
  for (const noteUrl of outboxUrls) {
    const note = await tryFetchBridgedNote(noteUrl, options, 'actor-outbox');
    if (note) {
      return note;
    }
  }

  return null;
}

async function tryFetchBridgedNote(noteUrl: string, options, source: string) {
  const note = await fetchActivityPubJson(noteUrl, options, {allowMissing: true});
  if (!isUsableActivityPubNote(note)) {
    return null;
  }
  return {
    ...note,
    geesomeSmokeSource: source
  };
}

async function getActorFeaturedNoteUrls(options, actor, warnings: string[]): Promise<string[]> {
  const featured = typeof actor.featured === 'string'
    ? await fetchActivityPubJson(actor.featured, options, {allowMissing: true})
    : actor.featured;
  if (!featured) {
    return [];
  }
  const urls = getCollectionItemUrls(featured);
  if (!urls.length) {
    warnings.push('activitypub_actor_featured_empty');
  }
  return urls;
}

async function getActorOutboxNoteUrls(options, actor, warnings: string[]): Promise<string[]> {
  if (typeof actor.outbox !== 'string') {
    return [];
  }
  const outbox = await fetchActivityPubJson(actor.outbox, options, {allowMissing: true});
  const urls = getCollectionItemUrls(outbox?.first || outbox);
  if (!urls.length) {
    warnings.push('activitypub_actor_outbox_empty');
  }
  return urls;
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

function getSmokeOptions() {
  const bridgeOrigin = normalizeOrigin(process.env.ACTIVITYPUB_BLUESKY_SMOKE_BRIDGE_ORIGIN || defaultBridgeOrigin);
  const bridgeDomain = new URL(bridgeOrigin).host;
  const handle = normalizeBlueskyHandle(
    process.env.ACTIVITYPUB_BLUESKY_SMOKE_HANDLE || defaultBlueskyHandle,
    bridgeDomain
  );
  return {
    handle,
    bridgeOrigin,
    bridgeDomain,
    atprotoPublicApiOrigin: normalizeOrigin(process.env.ACTIVITYPUB_BLUESKY_SMOKE_ATPROTO_ORIGIN || defaultAtprotoPublicApiOrigin),
    timeoutMs: parsePositiveInteger(process.env.ACTIVITYPUB_BLUESKY_SMOKE_TIMEOUT_MS, defaultTimeoutMs),
    resource: `acct:${handle}@${bridgeDomain}`
  };
}

function getActivityPubSelfLink(webFinger): string | null {
  const link = (webFinger?.links || []).find((item) => {
    return item?.rel === 'self' && isActivityPubContentType(item?.type) && typeof item?.href === 'string';
  });
  return link?.href || null;
}

function assertBridgedBlueskyActor(actor, options): void {
  assert.equal(typeof actor?.id, 'string');
  assert.equal(actor.id.startsWith(`${options.bridgeOrigin}/ap/`), true);
  assert.equal(actor.preferredUsername, options.handle);
  assert.equal(typeof actor.inbox, 'string');
  assert.equal(typeof actor.endpoints?.sharedInbox, 'string');
  assert.equal(typeof actor.publicKey?.id, 'string');
  assert.equal(actor.publicKey.owner, actor.id);
  assert.match(actor.publicKey.publicKeyPem, /^-----BEGIN PUBLIC KEY-----/);
}

function getTargetedCreateActivity(actor, note, localActorUrl: string) {
  const targetedNote = {
    ...note,
    attributedTo: actor.id,
    to: uniqueValues([...getReferenceValues(note.to), activityPubPublicCollection, localActorUrl]),
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
    id: `${note.id}#geesome-smoke-create`,
    type: 'Create',
    actor: actor.id,
    to: targetedNote.to,
    object: targetedNote
  };
}

function getBridgyConvertUrl(bridgeOrigin: string, atUri: string): string {
  return `${bridgeOrigin}/convert/ap/${encodeURI(atUri)}`;
}

function getCollectionItemUrls(collection): string[] {
  const items = getArrayValues(collection?.orderedItems || collection?.items);
  return items.map((item) => {
    if (typeof item === 'string') {
      return item;
    }
    return item?.id;
  }).filter((value) => typeof value === 'string' && value);
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
  return getReferenceValues(note.to).includes(activityPubPublicCollection);
}

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

function normalizeBlueskyHandle(value: string, bridgeDomain: string): string {
  const handle = value.trim().replace(/^@/, '');
  if (handle.endsWith(`@${bridgeDomain}`)) {
    return handle.slice(0, -1 * (`@${bridgeDomain}`).length);
  }
  return handle;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
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

function getErrorMessage(error): string {
  return error?.message || String(error);
}

function printSmokeSkip(options, reason: string, extra: any = {}): void {
  printSmokeReport({
    ok: true,
    skipped: true,
    reason,
    handle: options.handle,
    bridge: {
      resource: options.resource,
      origin: options.bridgeOrigin
    },
    ...extra
  });
}

function printSmokeReport(report): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function printUsage(): void {
  console.log(`Usage:
  npm run activitypub:bluesky-bridge-smoke
  ACTIVITYPUB_BLUESKY_SMOKE_HANDLE=bsky.app npm run activitypub:bluesky-bridge-smoke

Fetches a public Bluesky account through Bridgy Fed, converts the latest public
ATProto feed item to ActivityPub when available, and feeds a signed
fixture-equivalent Create(Note) through the GeeSome activityPub module using an
in-memory disposable local group.

Environment:
  ACTIVITYPUB_BLUESKY_SMOKE_HANDLE          Bluesky handle, default bsky.app
  ACTIVITYPUB_BLUESKY_SMOKE_BRIDGE_ORIGIN   ActivityPub bridge, default https://bsky.brid.gy
  ACTIVITYPUB_BLUESKY_SMOKE_ATPROTO_ORIGIN  Public ATProto API, default https://public.api.bsky.app
  ACTIVITYPUB_BLUESKY_SMOKE_TIMEOUT_MS      Fetch timeout, default 15000`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
