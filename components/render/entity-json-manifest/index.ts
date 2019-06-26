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
import {IContent, IGroup, IPost} from "../../database/interface";

const _ = require('lodash');
const treeLib = require('../../../libs/base36Trie');

module.exports = async (app: IGeesomeApp) => {
    
    return new EntityJsonManifest(app);
};

class EntityJsonManifest implements IRender {
    constructor(public app: IGeesomeApp) {

    }

    async generateContent(name, data, options?) {
        if(name === 'group-manifest') {
            //TODO: size => postsSize
            const group: IGroup = data;
            const groupManifest = _.pick(group, ['name', 'title', 'type', 'view', 'isPublic', 'description', 'size']);

            groupManifest.postsCount = group.publishedPostsCount;
            groupManifest.ipns = group.manifestStaticStorageId;
            
            if(group.avatarImage) {
                groupManifest.avatarImage = this.getStorageRef(group.avatarImage.manifestStorageId);
            }
            if(group.coverImage) {
                groupManifest.coverImage = this.getStorageRef(group.coverImage.manifestStorageId);
            }

            groupManifest.posts = {};
            
            const groupPosts = await this.app.database.getGroupPosts(group.id, 'desc', 100, 0);
            groupPosts.forEach((post: IPost) => {
                if(!post.manifestStorageId) {
                    return;
                }
                treeLib.setNode(groupManifest.posts, post.localId, this.getStorageRef(post.manifestStorageId));
            });

            this.setManifestVersion(groupManifest, name);
            
            return groupManifest;
        } else if(name === 'post-manifest') {
            const post: IPost = data;
            //TODO: fix size, view and type
            //TODO: add groupNumber
            const postManifest = _.pick(post, ['status', 'publishedAt', 'view', 'type', 'size']);

            const group = await this.app.database.getGroup(post.groupId);
            postManifest.group = group.manifestStaticStorageId;
            
            postManifest.contents = post.contents.map((content: IContent) => {
                return this.getStorageRef(content.manifestStorageId);
            });

            this.setManifestVersion(postManifest, name);
            
            return postManifest;
        } else if(name === 'content-manifest') {
            //TODO: add preview size
            const content: IContent = data;
            const contentManifest = _.pick(content, ['name', 'description', 'mimeType', 'storageType', 'previewMimeType', 'view', 'size', 'extension', 'previewExtension', 'updatedAt', 'createdAt']);

            contentManifest.content = content.storageId;
            contentManifest.preview = content.previewStorageId;

            this.setManifestVersion(contentManifest, name);
            
            return contentManifest;
        }
        return '';
    }
    
    async manifestIdToDbObject(manifestId) {
        manifestId = this.app.checkStorageId(manifestId);
        const manifest = await this.app.storage.getObject(manifestId);
        
        if(manifest._type === 'group-manifest') {
            const group: IGroup = _.pick(manifest, ['name', 'title', 'type', 'view', 'isPublic', 'description', 'size']);
            group.isRemote = true;
            group.manifestStorageId = manifestId;
            
            if(manifest.avatarImage) {
                group.avatarImage = (await this.manifestIdToDbObject(manifest.avatarImage)) as any;
            }
            if(manifest.coverImage) {
                group.coverImage = (await this.manifestIdToDbObject(manifest.coverImage)) as any;
            }

            group.publishedPostsCount = manifest.postsCount;
            group.manifestStaticStorageId = manifest.ipns;

            //TODO: import posts too
            return group;
        } else if(manifest._type === 'content-manifest') {
            const content: IContent = _.pick(manifest, ['name', 'mimeType', 'storageType', 'previewMimeType', 'view', 'size', 'extension', 'previewExtension']);

            content.storageId = manifest.content;
            content.previewStorageId = manifest.preview;
            content.manifestStorageId = manifestId;

            return content;
        }
    }
    
    getStorageRef(storageId) {
        return {
            '/' : storageId
        }
    }
    
    setManifestVersion(manifest, type) {
        manifest._version = "0.1";
        manifest._source = "geesome-core";
        manifest._protocol = "geesome-ipsp";
        manifest._type = type;
    }
}
