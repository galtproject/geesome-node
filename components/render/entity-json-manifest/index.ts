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
import {ContentType, GroupType, GroupView, IContent, IGroup, IPost, PostStatus} from "../../database/interface";

const _ = require('lodash');
const treeLib = require('../../../libs/trie');

module.exports = async (app: IGeesomeApp) => {
    
    return new EntityJsonManifest(app);
};

class EntityJsonManifest implements IRender {
    constructor(public app: IGeesomeApp) {

    }

    async generateContent(name, data, options?) {
        if(name === 'group-manifest') {
            const group: IGroup = data;
            const groupManifest = _.pick(group, ['name', 'title', 'type', 'view', 'isPublic', 'description']);

            groupManifest.ipns = group.manifestStaticStorageId;
            
            if(group.avatarImage) {
                groupManifest.avatarImage = this.getStorageRef(group.avatarImage.manifestStorageId);
            }
            if(group.coverImage) {
                groupManifest.coverImage = this.getStorageRef(group.coverImage.manifestStorageId);
            }

            groupManifest.posts = {
                1: 223,
                2: 343,
                3: 234
            };
            
            (await this.app.database.getGroupPosts(group.id, 'desc', 0, 100)).forEach((post: IPost) => {
                treeLib.setNode(groupManifest.posts, post.id, this.getStorageRef(post.manifestStorageId));
            });
            
            return groupManifest;
        } else if(name === 'post-manifest') {
            const post: IPost = data;
            const postManifest = _.pick(post, ['status', 'publishedAt', 'view', 'type']);

            postManifest.contents = post.contents.map((content: IContent) => {
                return this.getStorageRef(content.manifestStorageId);
            });
            postManifest.size = _.sumBy(postManifest.contents, 'size');

            return postManifest;
        } else if(name === 'content-manifest') {
            const content: IContent = data;
            const contentManifest = _.pick(content, ['type', 'view', 'size']);

            contentManifest.content = data.storageId;

            return contentManifest;
        }
        return '';
    }
    
    getStorageRef(storageId) {
        return {
            '/' : storageId
        }
    }
}
