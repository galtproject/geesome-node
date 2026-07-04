import assert from 'node:assert';
import {Op} from 'sequelize';
import activityPubModule from '../../app/modules/activityPub/index.js';
import {generateActivityPubRsaKeyPair, signActivityPubRequestWithKey} from '../../app/modules/activityPub/signatureHelpers.js';
import {ContentMimeType} from '../../app/modules/database/interface.js';
import {GroupType, GroupView, PostStatus} from '../../app/modules/group/interface.js';
import {RICH_TEXT_MIME_TYPE, createRichTextDocument} from '../../app/richText.js';

export type ActivityPubSmokeHarness = Awaited<ReturnType<typeof createActivityPubSmokeHarness>>;

type ActivityPubSmokeHarnessOptions = {
  remoteActorDocument: any;
};

export async function createActivityPubSmokeHarness(options: ActivityPubSmokeHarnessOptions) {
  const models = getModelsStub();
  const calls: any = {
    saveData: [],
    createRemotePostByObject: [],
    remotePosts: {}
  };
  const remoteActorKey = getSmokeRemoteActorKey(options.remoteActorDocument.id);
  const remoteActorDocument = getSmokeRemoteActorDocument(options.remoteActorDocument, remoteActorKey);
  const app = getSmokeApp(calls);

  return {
    module: await activityPubModule(app as any, {
      models,
      fetchRemoteActor: async (actorUrl) => {
        assert.equal(actorUrl, remoteActorDocument.id);
        return remoteActorDocument;
      },
      remoteActorCacheMaxAgeMs: Number.MAX_SAFE_INTEGER
    }),
    models,
    calls,
    remoteActorKey,
    signSharedInboxActivity(activity: any) {
      return getSignedInboxRequest(remoteActorKey, '/ap/shared-inbox', activity);
    }
  };
}

function getSmokeApp(calls) {
  const group = getSmokeGroup();

  return {
    config: {
      activityPubConfig: {
        enabled: true,
        publicUrl: 'https://social.example',
        domain: 'example.com',
        deliveryWorker: false
      }
    },
    checkModules(modules) {
      assert.deepEqual(modules, ['api', 'group', 'database', 'content', 'asyncOperation']);
    },
    encryptTextWithAppPass: async (value) => `encrypted:${Buffer.from(value).toString('base64')}`,
    decryptTextWithAppPass: async (value) => Buffer.from(value.replace(/^encrypted:/, ''), 'base64').toString(),
    ms: {
      api: getApiStub(),
      database: {
        setDefaultListParamsValues(listParams, defaults = {}) {
          listParams.limit = Number(listParams.limit || defaults.limit || 20);
          listParams.offset = Number(listParams.offset || defaults.offset || 0);
          listParams.sortBy = listParams.sortBy || defaults.sortBy || 'createdAt';
          listParams.sortDir = listParams.sortDir || defaults.sortDir || 'DESC';
        }
      },
      content: {
        async saveData(userId, dataToSave, fileName, options) {
          calls.saveData.push({userId, dataToSave, fileName, options});
          return {
            id: 200 + calls.saveData.length,
            userId,
            name: fileName,
            mimeType: options.mimeType,
            storageId: `saved-activitypub-smoke-content-${calls.saveData.length}`
          };
        }
      },
      asyncOperation: getAsyncOperationStub(calls),
      group: {
        async getGroupByParams(params) {
          if (params.name !== group.name) {
            return null;
          }
          return group;
        },
        async getGroupPosts(groupId) {
          if (Number(groupId) !== group.id) {
            return {list: [], total: 0};
          }
          return {
            list: [getSmokePost()],
            total: 1
          };
        },
        async getGroupPostRefsByLocalIds(groupId, localIds) {
          if (Number(groupId) !== group.id || !localIds.includes('7')) {
            return [];
          }
          return [getSmokePost()];
        },
        async getPostPure(postId) {
          if (Number(postId) === getSmokePost().id) {
            return {
              ...getSmokePost(),
              group
            };
          }
          return calls.remotePosts[Number(postId)] || null;
        },
        async getPostContentDataWithUrl(_post, baseStorageUri) {
          return getSmokePostContents(baseStorageUri);
        },
        async prepareContentDataWithUrl(content, baseStorageUri) {
          return {
            ...content,
            type: content.mimeType.includes('image') ? 'image' : 'document',
            url: baseStorageUri + content.storageId
          };
        },
        async createRemotePostByObject(userId, postData) {
          calls.createRemotePostByObject.push({userId, postData});
          const post = {
            ...postData,
            id: 8801,
            userId,
            isRemote: true,
            isDeleted: false,
            status: PostStatus.Published
          };
          calls.remotePosts[post.id] = post;
          return post;
        }
      }
    }
  };
}

function getApiStub() {
  return {
    onUnversionGet() {},
    onUnversionPost() {},
    onAuthorizedGet() {},
    onAuthorizedPost() {}
  };
}

function getModelsStub() {
  return {
    ActivityPubActor: getModelStub(),
    ActivityPubRemoteActor: getModelStub(),
    ActivityPubSourceSubscription: getModelStub(),
    ActivityPubFollow: getModelStub(),
    ActivityPubObject: getModelStub(),
    ActivityPubDelivery: getModelStub(),
    ActivityPubObjectReview: getModelStub(),
    ActivityPubFlag: getModelStub()
  };
}

function getAsyncOperationStub(calls) {
  calls.asyncOperationQueues = calls.asyncOperationQueues || [];
  calls.asyncOperations = calls.asyncOperations || [];

  return {
    async addUniqueUserOperationQueue(userId, module, userApiKeyId, input) {
      const queue = {
        id: calls.asyncOperationQueues.length + 1,
        userId,
        module,
        userApiKeyId,
        inputJson: JSON.stringify(input),
        isWaiting: true,
        asyncOperationId: null
      };
      calls.asyncOperationQueues.push(queue);
      return queue;
    },
    async getWaitingOperationByModule(module) {
      return calls.asyncOperationQueues.find((queue) => {
        return queue.module === module && queue.isWaiting;
      }) || null;
    },
    async updateUserOperationQueue(id, updateData) {
      const queue = calls.asyncOperationQueues.find((item) => item.id === Number(id));
      if (queue) {
        Object.assign(queue, updateData);
      }
      return queue;
    },
    async addAsyncOperation(userId, asyncOperationData) {
      const operation = {
        id: calls.asyncOperations.length + 1,
        userId,
        ...asyncOperationData
      };
      calls.asyncOperations.push(operation);
      return operation;
    },
    async setAsyncOperationToUserOperationQueue(queueId, asyncOperationId) {
      const queue = calls.asyncOperationQueues.find((item) => item.id === Number(queueId));
      if (queue) {
        queue.asyncOperationId = asyncOperationId;
      }
      return queue;
    },
    async closeUserOperationQueueByAsyncOperationId(asyncOperationId) {
      calls.asyncOperationQueues.forEach((queue) => {
        if (queue.asyncOperationId === Number(asyncOperationId)) {
          queue.isWaiting = false;
        }
      });
    },
    async finishAsyncOperation(_userId, asyncOperationId, _contentId = null, output = null) {
      const operation = calls.asyncOperations.find((item) => item.id === Number(asyncOperationId));
      if (operation) {
        operation.inProcess = false;
        operation.percent = 100;
        operation.output = output;
      }
      return operation;
    },
    async errorAsyncOperation(_userId, asyncOperationId, errorMessage) {
      const operation = calls.asyncOperations.find((item) => item.id === Number(asyncOperationId));
      if (operation) {
        operation.inProcess = false;
        operation.errorMessage = errorMessage;
      }
      return operation;
    }
  };
}

function getModelStub() {
  const rows: any[] = [];
  return {
    rows,
    async findOne({where} = {where: {}}) {
      return rows.find((row) => rowMatchesWhere(row, where || {})) || null;
    },
    async findAll({where} = {where: {}}) {
      return rows.filter((row) => rowMatchesWhere(row, where || {}));
    },
    async findAndCountAll({where, limit, offset} = {where: {}, limit: undefined, offset: undefined}) {
      const matchingRows = rows.filter((row) => rowMatchesWhere(row, where || {}));
      return {
        rows: matchingRows.slice(offset || 0, (offset || 0) + (limit || matchingRows.length)),
        count: matchingRows.length
      };
    },
    async create(data) {
      const row = {
        ...data,
        id: rows.length + 1,
        async update(updateData) {
          Object.assign(this, updateData);
          return this;
        }
      };
      rows.push(row);
      return row;
    },
    async destroy() {
      rows.length = 0;
    }
  };
}

function rowMatchesWhere(row, where) {
  return Reflect.ownKeys(where).every((key) => valueMatchesWhere(row[key as any], where[key as any]));
}

function valueMatchesWhere(value, condition) {
  if (isInCondition(condition)) {
    const key = Reflect.ownKeys(condition)[0];
    return condition[key as any].includes(value);
  }
  if (isNotInCondition(condition)) {
    const key = Reflect.ownKeys(condition)[0];
    return !condition[key as any].includes(value);
  }
  if (isLteCondition(condition)) {
    const key = Reflect.ownKeys(condition)[0];
    return compareValues(value, condition[key as any]) <= 0;
  }
  return value === condition;
}

function isInCondition(condition): boolean {
  return isArrayCondition(condition, Op.in);
}

function isNotInCondition(condition): boolean {
  return isArrayCondition(condition, Op.notIn);
}

function isArrayCondition(condition, op): boolean {
  if (!condition || typeof condition !== 'object') {
    return false;
  }
  const keys = Reflect.ownKeys(condition);
  if (keys.length !== 1) {
    return false;
  }
  return keys[0] === op && Array.isArray(condition[keys[0] as any]);
}

function isLteCondition(condition): boolean {
  if (!condition || typeof condition !== 'object') {
    return false;
  }
  const keys = Reflect.ownKeys(condition);
  if (keys.length !== 1) {
    return false;
  }
  return String(keys[0]).includes('lte');
}

function compareValues(left, right): number {
  const leftTime = toComparableTime(left);
  const rightTime = toComparableTime(right);
  if (leftTime !== null && rightTime !== null) {
    return leftTime - rightTime;
  }
  return Number(left) - Number(right);
}

function toComparableTime(value): number | null {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return null;
  }
  return time;
}

function getSmokeRemoteActorKey(actorUrl: string) {
  const keyPair = generateActivityPubRsaKeyPair();

  return {
    keyId: `${actorUrl}#geesome-smoke-key`,
    actorUrl,
    publicKeyPem: keyPair.publicKeyPem,
    privateKeyPem: keyPair.privateKeyPem
  };
}

function getSmokeRemoteActorDocument(actorDocument, actorKey) {
  return {
    ...actorDocument,
    publicKey: {
      id: actorKey.keyId,
      owner: actorKey.actorUrl,
      publicKeyPem: actorKey.publicKeyPem
    }
  };
}

function getSignedInboxRequest(actorKey, path: string, activity: any) {
  const body = JSON.stringify(activity);
  const date = new Date();
  const signedRequest = signActivityPubRequestWithKey(actorKey, {
    method: 'POST',
    url: `https://social.example${path}`,
    body,
    date
  });

  return {
    method: 'POST',
    url: path,
    headers: signedRequest.headers,
    body: activity,
    rawBody: Buffer.from(body),
    now: date
  };
}

function getSmokeGroup() {
  return {
    id: 3,
    name: 'test-channel',
    title: 'Test Channel',
    description: 'ActivityPub bridge smoke channel',
    homePage: 'https://social.example/groups/test-channel',
    type: GroupType.Channel,
    view: GroupView.TelegramLike,
    theme: 'default',
    isPublic: true,
    isOpen: true,
    isRemote: false,
    isEncrypted: false,
    isReplyForbidden: false,
    creatorId: 1,
    avatarImage: {
      id: 21,
      storageId: 'avatar-storage',
      mimeType: ContentMimeType.ImagePng
    }
  } as any;
}

function getSmokePost() {
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
  } as any;
}

function getSmokePostContents(baseStorageUri: string) {
  const document = createRichTextDocument([{
    type: 'paragraph',
    children: [{text: 'Local ActivityPub smoke target'}]
  }]);

  return [{
    id: 101,
    type: 'text',
    text: JSON.stringify(document),
    storageId: 'local-smoke-text',
    mimeType: RICH_TEXT_MIME_TYPE,
    url: `${baseStorageUri}local-smoke-text`
  }];
}
