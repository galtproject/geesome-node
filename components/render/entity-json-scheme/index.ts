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

module.exports = async (app: IGeesomeApp) => {
    
    return new EntityJsonScheme(app);
};

class EntityJsonScheme implements IRender {
    constructor(public app: IGeesomeApp) {

    }

    async generateContent(name, data, options?) {
        if(name === 'group') {
            const group: IGroup = data;
            const groupScheme = _.pick(group, ['name', 'title', 'type', 'view', 'isPublic', 'description']);

            groupScheme.ipns = group.storageAccountId;
            
            groupScheme.avatarImage = this.getStorageRef(group.avatarImage.manifestStorageId);
            groupScheme.coverImage = this.getStorageRef(group.coverImage.manifestStorageId);

            groupScheme.posts = (await this.app.database.getGroupPosts(group.id, 'desc', 0, 100)).map((post: IPost) => {
                return this.getStorageRef(post.manifestStorageId);
            });
            
            return groupScheme;
        } else if(name === 'post') {
            const post: IPost = data;
            const postScheme = _.pick(post, ['status', 'publishedAt', 'view', 'type']);

            postScheme.contents = postScheme.contents.map((content: IContent) => {
                return this.getStorageRef(content.manifestStorageId);
            });
            postScheme.size = _.sumBy(postScheme.contents, 'size');

            return postScheme;
        } else if(name === 'content') {
            const content: IContent = data;
            const contentScheme = _.pick(content, ['type', 'view', 'size']);

            contentScheme.content = data.manifestStorageId;

            return contentScheme;
        }
        return '';
    }
    
    getStorageRef(storageId) {
        return {
            '/' : storageId
        }
    }
}
