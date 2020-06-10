/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IRender} from "../interface";
import {IGeesomeApp} from "../../app/interface";
import {GroupType, ICategory, IContent, IGroup, IPost, IUser, PostStatus} from "../../database/interface";

const _ = require('lodash');
const bs58 = require('bs58');
const pIteration = require('p-iteration');
const treeLib = require('geesome-libs/src/base36Trie');

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
      //TODO: add previous ID
      groupManifest.staticId = group.manifestStaticStorageId;
      groupManifest.publicKey = await this.app.database.getStaticIdPublicKey(groupManifest.staticId);

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
      const groupPosts = await this.app.database.getGroupPosts(group.id, {status: PostStatus.Published}, {limit: 100, offset: 0});
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
      const category: ICategory = data;
      const categoryManifest = _.pick(category, ['name', 'title', 'type', 'view', 'theme', 'isGlobal', 'description', 'createdAt', 'updatedAt']);

      this.setManifestMeta(categoryManifest, name);

      return categoryManifest;
    } else if (name === 'post-manifest') {
      const post: IPost = data;
      //TODO: fix size, view and type
      //TODO: add groupNumber
      const postManifest = _.pick(post, ['status', 'publishedAt', 'view', 'type', 'size']);

      postManifest.groupId = post.groupStorageId;
      postManifest.groupStaticId = post.groupStaticStorageId;
      
      postManifest.authorId = post.authorStorageId;
      postManifest.authorStaticId = post.authorStaticStorageId;

      postManifest.contents = post.contents.map((content: IContent) => {
        return {
          storageId: content.manifestStorageId //this.getStorageRef(content.manifestStorageId)
        };
      });

      this.setManifestMeta(postManifest, name);

      return postManifest;
    } else if (name === 'user-manifest') {
      const user: IUser = data;
      const userManifest = _.pick(user, ['name', 'title', 'email', 'description', 'updatedAt', 'createdAt']);

      userManifest.staticId = user.manifestStaticStorageId;
      userManifest.publicKey = await this.app.database.getStaticIdPublicKey(userManifest.staticId);

      if (user.avatarImage) {
        userManifest.avatarImage = this.getStorageRef(user.avatarImage.manifestStorageId);
      }

      userManifest.accounts = await this.app.database.getUserAccountList(user.id).then(list => {
        return list.map(({provider, address}) => ({provider, address}))
      });

      this.setManifestMeta(userManifest, name);

      console.log('userManifest', JSON.stringify(userManifest));
      
      return userManifest;
    } else if (name === 'content-manifest') {
      const content: IContent = data;
      const contentManifest = _.pick(content, ['name', 'description', 'mimeType', 'storageType', 'size', 'extension']);

      if(content.propertiesJson) {
        contentManifest.properties = JSON.parse(content.propertiesJson);
      }
      contentManifest.storageId = content.storageId;
      contentManifest.preview = {
        medium: {
          storageId: content.mediumPreviewStorageId,
          mimeType: content.previewMimeType,
          extension: content.previewExtension,
          size: content.mediumPreviewSize
        }
      };

      if (content.smallPreviewStorageId) {
        contentManifest.preview.small = {
          storageId: content.smallPreviewStorageId,
          mimeType: content.previewMimeType,
          extension: content.previewExtension,
          size: content.smallPreviewSize
        };
      }
      if (content.largePreviewStorageId) {
        contentManifest.preview.large = {
          storageId: content.largePreviewStorageId,
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
      group.manifestStaticStorageId = manifest.staticId;

      //TODO: check ipns for valid bound to ipld
      await this.app.database.setStaticIdPublicKey(manifest.staticId, manifest.publicKey).catch(() => {});
      await this.app.database.addStaticIdHistoryItem({
        staticId: manifest.staticId,
        dynamicId: manifestId,
        isActive: true,
        boundAt: new Date()
      }).catch(() => {});

      //TODO: import posts too
      return group;
    } else if (type === 'user-manifest') {
      const user: IUser = _.pick(manifest, ['name', 'title', 'email', 'description']);
      user.manifestStorageId = manifestId;

      if (manifest.avatarImage) {
        user.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
      }

      user.manifestStaticStorageId = manifest.staticId;
      
      //TODO: check ipns for valid bound to ipld
      await this.app.database.setStaticIdPublicKey(manifest.staticId, manifest.publicKey).catch(() => {});
      await this.app.database.addStaticIdHistoryItem({
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
        post = _.pick(manifest, ['status', 'publishedAt', 'view', 'type', 'size']);

        post.manifestStorageId = manifestId;
        
        post.authorStorageId = manifest.authorId;
        post.authorStaticStorageId = manifest.authorStaticId;

        post.groupStorageId = manifest.groupId;
        post.groupStaticStorageId = manifest.groupStaticId;
        // const group = await this.app.createGroupByRemoteStorageId(manifest.group)

        const contentsIds = manifest.contents.map(content => {
          return content.storageId;
        });

        post.contents = await pIteration.map(contentsIds, (contentId) => {
          return this.app.createContentByRemoteStorageId(contentId);
        });
      }
      
      return post;
    } else if (type === 'content-manifest') {
      const content: IContent = _.pick(manifest, ['name', 'mimeType', 'storageType', 'view', 'size', 'extension']);

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
