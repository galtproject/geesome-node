/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {IRender} from "../interface";
import {IGeesomeApp} from "../../app/interface";
import {GroupType, IContent, IGroup, IPost, IUser, PostStatus} from "../../database/interface";

const _ = require('lodash');
const bs58 = require('bs58');
const pIteration = require('p-iteration');
const treeLib = require('@galtproject/geesome-libs/src/base36Trie');

module.exports = async (app: IGeesomeApp) => {

  return new EntityJsonManifest(app);
};

class EntityJsonManifest implements IRender {
  constructor(public app: IGeesomeApp) {

  }

  async generateContent(name, data, options?) {
    if (name === 'group-manifest') {
      //TODO: size => postsSize
      const group: IGroup = data;
      const groupManifest = _.pick(group, ['name', 'title', 'type', 'view', 'theme', 'isPublic', 'description', 'size', 'createdAt', 'updatedAt']);

      if(data.isEncrypted) {
        groupManifest.isEncrypted = true;
      }
      groupManifest.postsCount = group.publishedPostsCount;
      groupManifest.ipns = group.manifestStaticStorageId;
      groupManifest.publicKey = await this.app.database.getStaticIdPublicKey(groupManifest.ipns);

      if (group.avatarImage) {
        groupManifest.avatarImage = this.getStorageRef(group.avatarImage.manifestStorageId);
      }
      if (group.coverImage) {
        groupManifest.coverImage = this.getStorageRef(group.coverImage.manifestStorageId);
      }
      
      // TODO: is this need for protocol?
      // currently used for getting companion info in chats list
      if(group.type === GroupType.PersonalChat) {
        const creator = await this.app.database.getUser(group.creatorId);
        groupManifest.members = [group.staticStorageId, creator.manifestStaticStorageId];
      }

      groupManifest.posts = {};

      // TODO: write all posts
      const groupPosts = await this.app.database.getGroupPosts(group.id, {limit: 100, offset: 0});
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
    } else if (name === 'post-manifest') {
      const post: IPost = data;
      //TODO: fix size, view and type
      //TODO: add groupNumber
      const postManifest = _.pick(post, ['status', 'publishedAt', 'view', 'type', 'size']);

      const group = await this.app.database.getGroup(post.groupId);
      postManifest.group = group.manifestStaticStorageId;
      postManifest.author = post.authorStaticStorageId;

      postManifest.contents = post.contents.map((content: IContent) => {
        return this.getStorageRef(content.manifestStorageId);
      });

      this.setManifestMeta(postManifest, name);

      return postManifest;
    } else if (name === 'user-manifest') {
      const user: IUser = data;
      const userManifest = _.pick(user, ['name', 'title', 'email', 'description', 'updatedAt', 'createdAt']);

      userManifest.ipns = user.manifestStaticStorageId;
      userManifest.publicKey = await this.app.database.getStaticIdPublicKey(userManifest.ipns);

      if (user.avatarImage) {
        userManifest.avatarImage = this.getStorageRef(user.avatarImage.manifestStorageId);
      }

      this.setManifestMeta(userManifest, name);

      console.log('userManifest', JSON.stringify(userManifest));
      
      return userManifest;
    } else if (name === 'content-manifest') {
      const content: IContent = data;
      const contentManifest = _.pick(content, ['name', 'description', 'mimeType', 'storageType', 'view', 'size', 'extension', 'updatedAt', 'createdAt']);

      contentManifest.content = content.storageId;
      contentManifest.preview = {
        medium: {
          content: content.mediumPreviewStorageId,
          mimeType: content.previewMimeType,
          extension: content.previewExtension,
          size: content.mediumPreviewSize
        }
      };

      if (content.smallPreviewStorageId) {
        contentManifest.preview.small = {
          content: content.smallPreviewStorageId,
          mimeType: content.previewMimeType,
          extension: content.previewExtension,
          size: content.smallPreviewSize
        };
      }
      if (content.largePreviewStorageId) {
        contentManifest.preview.large = {
          content: content.largePreviewStorageId,
          mimeType: content.previewMimeType,
          extension: content.previewExtension,
          size: content.largePreviewSize
        };
      }
      this.setManifestMeta(contentManifest, name);

      return contentManifest;
    }
    return '';
  }

  async manifestIdToDbObject(manifestId, type = null, options: any = {}) {
    manifestId = this.app.checkStorageId(manifestId);
    let manifest: any = {};

    if(!options.isEncrypted) {
      manifest = await this.app.storage.getObject(manifestId);
      
      if(!type) {
        type = manifest._type;
      }
    }
    
    if (type === 'group-manifest') {
      const group: IGroup = _.pick(manifest, ['name', 'title', 'type', 'view', 'isPublic', 'description', 'size']);
      group.manifestStorageId = manifestId;

      if (manifest.avatarImage) {
        group.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
      }
      if (manifest.coverImage) {
        group.coverImage = (await this.manifestIdToDbObject(manifest.coverImage)) as any;
      }

      group.publishedPostsCount = manifest.postsCount;
      group.manifestStaticStorageId = manifest.ipns;

      //TODO: import posts too
      return group;
    } else if (type === 'user-manifest') {
      const user: IUser = _.pick(manifest, ['name', 'title', 'email', 'description']);
      user.manifestStorageId = manifestId;

      if (manifest.avatarImage) {
        user.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
      }

      user.manifestStaticStorageId = manifest.ipns;

      return user;
    } else if (type === 'post-manifest') {
      let post: IPost;
      
      if(options.isEncrypted) {
        post = { ...options, isEncrypted: true, encryptedManifestStorageId: manifestId };
      } else {
        post = _.pick(manifest, ['status', 'publishedAt', 'view', 'type', 'size']);

        post.manifestStorageId = manifestId;
        post.authorStaticStorageId = manifest.author;
        // const group = await this.app.createGroupByRemoteStorageId(manifest.group)

        const contentsIds = manifest.contents.map(content => {
          return content['/'];
        });

        post.contents = await pIteration.map(contentsIds, (contentId) => {
          return this.app.createContentByRemoteStorageId(contentId);
        });
      }
      
      return post;
    } else if (type === 'content-manifest') {
      const content: IContent = _.pick(manifest, ['name', 'mimeType', 'storageType', 'previewMimeType', 'view', 'size', 'extension', 'previewExtension']);

      if(manifest.isEncrypted) {
        content.encryptedManifestStorageId = manifestId;
      } else {
        content.storageId = manifest.content;
        content.mediumPreviewStorageId = manifest.preview;
        content.manifestStorageId = manifestId;
      }

      return content;
    }
  }

  getStorageRef(storageId) {
    if (!storageId) {
      return null;
    }
    return {
      '/': storageId
    }
  }

  setManifestMeta(manifest, type) {
    manifest._version = "0.1";
    manifest._source = "geesome-node";
    manifest._protocol = "geesome-ipsp";
    manifest._type = type;
  }
}
