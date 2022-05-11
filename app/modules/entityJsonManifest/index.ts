/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../interface";
import IGeesomeEntityJsonManifestModule from "./interface";
import {GroupType, IGroup, IPost, PostStatus} from "../group/interface";
import {IContent, IUser} from "../database/interface";
import {IGroupCategory} from "../groupCategory/interface";

const pIteration = require('p-iteration');
const treeLib = require('geesome-libs/src/base36Trie');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const log = require('debug')('geesome:app');

module.exports = async (app: IGeesomeApp) => {
  return getModule(app);
};

function getModule(app: IGeesomeApp) {
  app.checkModules(['database', 'group', 'accountStorage', 'staticId', 'storage']);

  class EntityJsonManifest implements IGeesomeEntityJsonManifestModule {
    constructor() {

    }

    async generateContent(name, data, options?) {
      if (name === 'group-manifest') {
        //TODO: size => postsSize
        const group: IGroup = data;
        const groupManifest = ipfsHelper.pickObjectFields(group, ['name', 'homePage', 'title', 'type', 'view', 'theme', 'isPublic', 'description', 'size', 'createdAt', 'updatedAt']);

        if(data.isEncrypted) {
          groupManifest.isEncrypted = true;
        }
        groupManifest.postsCount = group.publishedPostsCount;
        //TODO: add previous ID
        groupManifest.staticId = group.manifestStaticStorageId;
        groupManifest.publicKey = await app.ms.accountStorage.getStaticIdPublicKeyByOr(groupManifest.staticId);

        if (group.avatarImage) {
          groupManifest.avatarImage = this.getStorageRef(group.avatarImage.manifestStorageId);
        }
        if (group.coverImage) {
          groupManifest.coverImage = this.getStorageRef(group.coverImage.manifestStorageId);
        }

        // TODO: is this need for protocol?
        // currently used for getting companion info in chats list
        if(group.type === GroupType.PersonalChat) {
          const creator = await app.ms.database.getUser(group.creatorId);
          groupManifest.members = [group.staticStorageId, creator.manifestStaticStorageId];
        }

        groupManifest.posts = {};

        // TODO: write all posts
        const groupPosts = await app.ms.group.getGroupPosts(group.id, {status: PostStatus.Published}, {limit: 1000, offset: 0}).then(r => r.list);
        // console.log('groupPosts', group.id, groupPosts);
        groupPosts.forEach((post: IPost) => {
          if(post.isEncrypted) {
            treeLib.setNode(groupManifest.posts, post.localId, post.encryptedManifestStorageId);
          } else if (post.manifestStorageId) {
            treeLib.setNode(groupManifest.posts, post.localId, this.getStorageRef(post.manifestStorageId));
          }
        });

        this.setManifestMeta(groupManifest, name);

        return groupManifest;
      } else if (name === 'category-manifest') {
        const category: IGroupCategory = data;
        const categoryManifest = ipfsHelper.pickObjectFields(category, ['name', 'title', 'type', 'view', 'theme', 'isGlobal', 'description', 'createdAt', 'updatedAt']);

        this.setManifestMeta(categoryManifest, name);

        return categoryManifest;
      } else if (name === 'post-manifest') {
        const post: IPost = data;
        //TODO: fix size, view and type
        //TODO: add groupNumber
        const postManifest = ipfsHelper.pickObjectFields(post, ['status', 'publishedAt', 'view', 'type', 'size', 'source', 'sourceChannelId', 'sourcePostId', 'sourceDate']);

        if(post.propertiesJson) {
          postManifest.properties = JSON.parse(post.propertiesJson);
        }

        postManifest.groupId = post.groupStorageId;
        postManifest.groupStaticId = post.groupStaticStorageId;

        postManifest.authorId = post.authorStorageId;
        postManifest.authorStaticId = post.authorStaticStorageId;

        postManifest.contents = post.contents.map((content: IContent) => {
          return {
            view: content.view,
            storageId: content.manifestStorageId //this.getStorageRef(content.manifestStorageId)
          };
        });

        this.setManifestMeta(postManifest, name);

        return postManifest;
      } else if (name === 'user-manifest') {
        const user: IUser = data;
        const userManifest = ipfsHelper.pickObjectFields(user, ['name', 'title', 'email', 'description', 'updatedAt', 'createdAt']);

        userManifest.staticId = user.manifestStaticStorageId;
        userManifest.publicKey = await app.ms.accountStorage.getStaticIdPublicKeyByOr(userManifest.staticId);

        if (user.avatarImage) {
          userManifest.avatarImage = this.getStorageRef(user.avatarImage.manifestStorageId);
        }

        userManifest.accounts = await app.ms.database.getUserAccountList(user.id).then(list => {
          return list.map(({provider, address}) => ({provider, address}))
        });

        this.setManifestMeta(userManifest, name);

        return userManifest;
      } else if (name === 'content-manifest') {
        const content: IContent = data;
        const contentManifest = ipfsHelper.pickObjectFields(content, ['name', 'description', 'mimeType', 'storageType', 'size', 'extension']);

        if(content.propertiesJson) {
          contentManifest.properties = JSON.parse(content.propertiesJson);
        }
        contentManifest.storageId = content.storageId;
        contentManifest.preview = {
          medium: {
            storageId: content.mediumPreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.mediumPreviewSize || null
          }
        };

        if (content.smallPreviewStorageId) {
          contentManifest.preview.small = {
            storageId: content.smallPreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.smallPreviewSize || null
          };
        }
        if (content.largePreviewStorageId) {
          contentManifest.preview.large = {
            storageId: content.largePreviewStorageId || null,
            mimeType: content.previewMimeType || null,
            extension: content.previewExtension || null,
            size: content.largePreviewSize || null
          };
        }
        this.setManifestMeta(contentManifest, name);

        return contentManifest;
      }
      return '';
    }

    async manifestIdToDbObject(manifestId, type = null, options: any = {}) {
      manifestId = ipfsHelper.getStorageIdHash(manifestId);
      let manifest: any = {};

      if(!options.isEncrypted) {
        log('manifestIdToDbObject:getObject', type, manifestId);
        manifest = await app.ms.storage.getObject(manifestId);
        log('manifestIdToDbObject:manifest', manifest);

        if(!type) {
          type = manifest._type;
        }
      }

      if (type === 'group-manifest') {
        const group: IGroup = ipfsHelper.pickObjectFields(manifest, ['name', 'homePage', 'title', 'type', 'view', 'isPublic', 'description', 'size']);
        group.manifestStorageId = manifestId;

        if (manifest.avatarImage) {
          group.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
        }
        if (manifest.coverImage) {
          group.coverImage = (await this.manifestIdToDbObject(manifest.coverImage)) as any;
        }

        group.publishedPostsCount = manifest.postsCount;
        group.manifestStaticStorageId = manifest.staticId;

        //TODO: check ipns for valid bound to ipld
        await app.ms.accountStorage.setStaticIdKey(null, manifest.staticId, manifest.publicKey).catch(() => {});
        await app.ms.staticId.addStaticIdHistoryItem({
          staticId: manifest.staticId,
          dynamicId: manifestId,
          isActive: true,
          boundAt: new Date()
        }).catch(() => {});

        //TODO: import posts too
        return group;
      } else if (type === 'user-manifest') {
        const user: IUser = ipfsHelper.pickObjectFields(manifest, ['name', 'title', 'email', 'description']);
        user.manifestStorageId = manifestId;

        if (manifest.avatarImage) {
          user.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
        }

        user.manifestStaticStorageId = manifest.staticId;
        log('manifestIdToDbObject:user', user);

        //TODO: check ipns for valid bound to ipld
        await app.ms.accountStorage.setStaticIdKey(null, manifest.staticId, manifest.publicKey).catch(() => {});
        await app.ms.staticId.addStaticIdHistoryItem({
          staticId: manifest.staticId,
          dynamicId: manifestId,
          isActive: true,
          boundAt: new Date()
        }).catch(() => {});

        return user;
      } else if (type === 'post-manifest') {
        let post: IPost;

        if(options.isEncrypted) {
          post = { ...options, isEncrypted: true, encryptedManifestStorageId: manifestId };
        } else {
          post = ipfsHelper.pickObjectFields(manifest, ['status', 'publishedAt', 'view', 'type', 'size']);

          post.manifestStorageId = manifestId;

          post.authorStorageId = manifest.authorId;
          post.authorStaticStorageId = manifest.authorStaticId;

          post.groupStorageId = manifest.groupId;
          post.groupStaticStorageId = manifest.groupStaticId;
          // const group = await app.createGroupByRemoteStorageId(manifest.group)

          const contentsIds = manifest.contents.map(content => {
            return content.storageId;
          });

          post.contents = await pIteration.map(contentsIds, (contentId) => {
            return app.ms.content.createContentByRemoteStorageId(null, contentId);
          });
        }

        return post;
      } else if (type === 'content-manifest') {
        const content: IContent = ipfsHelper.pickObjectFields(manifest, ['name', 'mimeType', 'storageType', 'view', 'size', 'extension']);

        if(manifest.isEncrypted) {
          content.encryptedManifestStorageId = manifestId;
        } else {
          content.storageId = manifest.storageId;

          if(manifest.preview) {
            if(manifest.preview.medium) {
              const mediumPreview = manifest.preview.medium;
              content.mediumPreviewStorageId = mediumPreview.storageId;
              content.mediumPreviewSize = mediumPreview.size;

              content.previewExtension = mediumPreview.extension;
              content.previewMimeType = mediumPreview.mimeType;
            }

            if(manifest.preview.small) {
              const smallPreview = manifest.preview.small;
              content.smallPreviewStorageId = smallPreview.storageId;
              content.smallPreviewSize = smallPreview.size;

              content.previewExtension = content.previewExtension || smallPreview.extension;
              content.previewMimeType = content.previewMimeType || smallPreview.mimeType;
            }

            if(manifest.preview.large) {
              const largePreview = manifest.preview.large;

              content.smallPreviewStorageId = largePreview.storageId;
              content.smallPreviewSize = largePreview.size;

              content.previewExtension = content.previewExtension || largePreview.extension;
              content.previewMimeType = content.previewMimeType || largePreview.mimeType;
            }
          }

          content.manifestStorageId = manifestId;
        }

        return content;
      }
    }

    getStorageRef(storageId) {
      if (!storageId) {
        return null;
      }
      return storageId;
    }

    setManifestMeta(manifest, type) {
      manifest._version = "0.1";
      manifest._source = "geesome-node";
      manifest._protocol = "geesome-ipsp";
      manifest._type = type;
    }
  }

  return new EntityJsonManifest();
}
