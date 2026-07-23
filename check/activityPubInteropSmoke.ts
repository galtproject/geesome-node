import assert from 'node:assert';

import {ContentMimeType} from '../app/modules/database/interface.js';
import {GroupType, GroupView, PostStatus} from '../app/modules/group/interface.js';
import type {IGroup, IPost} from '../app/modules/group/interface.js';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument} from '../app/richText.js';
import {
  activityPubContentType,
  activityPubNodeInfoContentType,
  activityPubNodeInfoDiscoveryContentType,
  activityPubWebFingerContentType,
  buildActivityPubGroupWebFingerResponse,
  buildActivityPubNodeInfoDiscoveryResponse,
  buildActivityPubNodeInfoResponse,
  getActivityPubGroupActorUrls,
  getActivityPubGroupPostObjectUrl,
  getActivityPubWebFingerUrl
} from '../app/modules/activityPub/helpers.js';
import {
  buildActivityPubGroupActor,
  buildActivityPubOutboxCollection,
  buildActivityPubPostCreateActivity,
  buildActivityPubPostNote
} from '../app/modules/activityPub/serializers.js';
import {printSmokeReport} from './helpers/smokeReport.js';

const config = {
  enabled: true,
  publicUrl: 'https://social.example',
  domain: 'example.com'
};

const group = getSmokeGroup();
const post = getSmokePost();
const contents = getSmokeContents();
const urls = getActivityPubGroupActorUrls(config, group);
const webFinger = buildActivityPubGroupWebFingerResponse(config, group);
const nodeInfoDiscovery = buildActivityPubNodeInfoDiscoveryResponse(config);
const nodeInfo = buildActivityPubNodeInfoResponse(config);
const actor = buildActivityPubGroupActor(config, group, {publicKeyPem: getPublicKeyPemFixture()});
const note = buildActivityPubPostNote(config, group, post, {contents});
const createActivity = buildActivityPubPostCreateActivity(config, group, post, {contents});
const outbox = buildActivityPubOutboxCollection(config, group, [post, getDraftPost()], {
  contentsByPostId: new Map([[post.id, contents]])
});
const smokeReportPathEnvName = 'ACTIVITYPUB_INTEROP_SMOKE_REPORT_PATH';

assertActivityPubContentTypes();
assertWebFingerDiscovery();
assertNodeInfoDiscovery();
assertActorDocument();
assertPostObject();
assertCreateActivity();
assertOutboxCollection();

printSmokeReport(getSmokeReport(), smokeReportPathEnvName);

function assertActivityPubContentTypes(): void {
  assert.equal(activityPubContentType, 'application/activity+json; charset=utf-8');
  assert.equal(activityPubWebFingerContentType, 'application/jrd+json; charset=utf-8');
  assert.equal(activityPubNodeInfoDiscoveryContentType, 'application/json; charset=utf-8');
  assert.equal(
    activityPubNodeInfoContentType,
    'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"; charset=utf-8'
  );
}

function assertWebFingerDiscovery(): void {
  assert.equal(webFinger.subject, 'acct:test-channel@example.com');
  assert.deepEqual(webFinger.aliases, [urls.actorUrl]);
  assert.deepEqual(webFinger.links, [{
    rel: 'self',
    type: 'application/activity+json',
    href: urls.actorUrl
  }]);
}

function assertNodeInfoDiscovery(): void {
  assert.deepEqual(nodeInfoDiscovery.links, [{
    rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
    href: 'https://social.example/nodeinfo/2.1'
  }]);
  assert.equal(nodeInfo.version, '2.1');
  assert.equal(nodeInfo.software.name, 'geesome-node');
  assert.deepEqual(nodeInfo.protocols, ['activitypub']);
  assert.equal(nodeInfo.metadata.nodeName, 'example.com');
}

function assertActorDocument(): void {
  assert.equal(actor.id, urls.actorUrl);
  assert.equal(actor.type, 'Group');
  assert.equal(actor.preferredUsername, 'test-channel');
  assert.equal(actor.inbox, urls.inboxUrl);
  assert.equal(actor.outbox, urls.outboxUrl);
  assert.equal(actor.followers, urls.followersUrl);
  assert.equal(actor.following, urls.followingUrl);
  assert.equal(actor.endpoints.sharedInbox, urls.sharedInboxUrl);
  assert.equal(actor.publicKey.id, `${urls.actorUrl}#main-key`);
  assert.equal(actor.publicKey.owner, urls.actorUrl);
  assert.match(actor.publicKey.publicKeyPem, /^-----BEGIN PUBLIC KEY-----/);
}

function assertPostObject(): void {
  assert.equal(note.id, getActivityPubGroupPostObjectUrl(config, group, post.localId));
  assert.equal(note.type, 'Note');
  assert.equal(note.attributedTo, urls.actorUrl);
  assert.deepEqual(note.to, ['https://www.w3.org/ns/activitystreams#Public']);
  assert.deepEqual(note.cc, [urls.followersUrl]);
  assert.equal(note.published, '2026-06-01T12:00:00.000Z');
  assert.equal(note.content.includes('javascript:'), false);
  assert.match(note.content, /Hello <strong>fediverse<\/strong>/);
  assert.match(note.content, /href="https:\/\/example\.com\/post"/);
  assert.deepEqual(note.tag, [
    {
      type: 'Mention',
      href: 'https://remote.example/users/alice',
      name: '@alice'
    },
    {
      type: 'Hashtag',
      href: 'https://social.example/tags/geesome',
      name: '#geesome'
    }
  ]);
  assert.deepEqual(note.attachment, [{
    type: 'Image',
    mediaType: ContentMimeType.ImagePng,
    url: 'https://social.example/ipfs/image-storage',
    name: 'image-storage'
  }]);
}

function assertCreateActivity(): void {
  assert.equal(createActivity.id, `${note.id}/activity/create`);
  assert.equal(createActivity.type, 'Create');
  assert.equal(createActivity.actor, urls.actorUrl);
  assert.deepEqual(createActivity.to, note.to);
  assert.deepEqual(createActivity.cc, note.cc);
  assert.deepEqual(createActivity.object, note);
}

function assertOutboxCollection(): void {
  assert.equal(outbox.id, urls.outboxUrl);
  assert.equal(outbox.type, 'OrderedCollection');
  assert.equal(outbox.totalItems, 1);
  assert.equal(outbox.orderedItems.length, 1);
  assert.equal(outbox.orderedItems[0].id, createActivity.id);
  assert.deepEqual(outbox.orderedItems[0].object, note);
}

function getSmokeReport() {
  return {
    ok: true,
    checked: [
      'content-types',
      'webfinger',
      'nodeinfo',
      'group-actor',
      'post-note',
      'create-activity',
      'outbox-filtering'
    ],
    urls: {
      webFinger: getActivityPubWebFingerUrl(config, group),
      nodeInfo: nodeInfoDiscovery.links[0].href,
      actor: urls.actorUrl,
      inbox: urls.inboxUrl,
      outbox: urls.outboxUrl,
      followers: urls.followersUrl,
      following: urls.followingUrl,
      sharedInbox: urls.sharedInboxUrl,
      post: note.id
    }
  };
}

function getSmokeGroup(): IGroup {
  return {
    id: 3,
    name: 'test-channel',
    title: 'Test Channel',
    description: 'A public test channel',
    homePage: 'https://social.example/groups/test-channel',
    type: GroupType.Channel,
    view: GroupView.TelegramLike,
    isPublic: true,
    isOpen: true,
    isRemote: false,
    isEncrypted: false,
    creatorId: 1
  } as IGroup;
}

function getSmokePost(): IPost {
  return {
    id: 11,
    status: PostStatus.Published,
    groupId: 3,
    userId: 1,
    localId: 7,
    publishedAt: new Date('2026-06-01T12:00:00Z'),
    isDeleted: false,
    isEncrypted: false,
    isRemote: false
  } as IPost;
}

function getDraftPost(): IPost {
  return {
    ...getSmokePost(),
    id: 12,
    localId: 8,
    status: PostStatus.Draft
  } as IPost;
}

function getSmokeContents() {
  const document = createRichTextDocument([{
    type: 'paragraph',
    children: [
      {text: 'Hello '},
      {text: 'fediverse', marks: [{type: 'strong'}]},
      {text: ' '},
      {text: '@alice', marks: [{type: 'mention', name: 'alice', href: 'https://remote.example/users/alice'}]},
      {text: ' '},
      {text: '#geesome', marks: [{type: 'hashtag', name: 'geesome', href: 'https://social.example/tags/geesome'}]},
      {text: ' link', marks: [{type: 'link', href: 'https://example.com/post'}]},
      {text: ' unsafe', marks: [{type: 'link', href: 'javascript:alert(1)'}]}
    ]
  }]);

  return [
    {
      id: 101,
      type: 'text',
      text: JSON.stringify(document),
      storageId: 'text-storage',
      mimeType: RICH_TEXT_MIME_TYPE,
      url: 'https://social.example/ipfs/text-storage'
    },
    {
      id: 102,
      type: 'image',
      storageId: 'image-storage',
      mimeType: ContentMimeType.ImagePng,
      url: 'https://social.example/ipfs/image-storage'
    }
  ] as any[];
}

function getPublicKeyPemFixture(): string {
  return [
    '-----BEGIN PUBLIC KEY-----',
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A',
    '-----END PUBLIC KEY-----'
  ].join('\n');
}
