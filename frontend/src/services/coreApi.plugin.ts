/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster), 
 * [Valery Litvin](https://github.com/litvintech) by 
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 * ​
 * Copyright ©️ 2018 Galt•Core Blockchain Company 
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and 
 * Galt•Space Society Construction and Terraforming Company by 
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import axios from 'axios';
import EthData from "@galtproject/frontend-core/libs/EthData";
const config = require('../../config');
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('../../../libs/ipfsHelper');
const trie = require('../../../libs/trie');

export default {
    install (Vue, options: any = {}) {
        let $http = axios.create({
            baseURL: config.serverBaseUrl,
            headers: {'Authorization': 'unauthorized'}
        });
        
        Vue.prototype.$coreApi = {
            saveFile(file, params = {}){
                const formData = new FormData();
                
                _.forEach(params, (value, key) => {
                    formData.append(key, value);
                });
                
                formData.append("file", file);
                return $http.post('/v1/user/save-file', formData, {  headers: { 'Content-Type': 'multipart/form-data' } }).then(response => response.data);
            },
            saveContentData(content, params = {}){
                return $http.post('/v1/user/save-content-data', _.extend({content}, params)).then(response => response.data);
            },
            getImageLink(storageId) {
                return config.serverBaseUrl + 'v1/content-data/' + storageId;
            },
            getContentData(storageId){
                return $http.get('/v1/content-data/' + storageId).then(response => response.data);
            },
            getContent(contentId){
                return $http.get('/v1/content/' + contentId).then(response => response.data);
            },
            getMemberInGroups(){
                return $http.get('/v1/user/member-in-groups').then(response => response.data);
            },
            getAdminInGroups(){
                return $http.get('/v1/user/admin-in-groups').then(response => response.data);
            },
            async getGroup(groupId){
                const groupObj = await this.getIpld(groupId);
                
                await this.fetchIpldFields(groupObj, ['avatarImage', 'coverImage']);
                
                return groupObj;
                // return $http.get(`/v1/group/${groupId}`).then(response => response.data);
            },
            async fetchIpldFields(obj, fieldsNamesArr) {
                await pIteration.forEach(fieldsNamesArr, async (fieldName) => {
                    _.set(obj, fieldName, await this.getIpld(_.get(obj, fieldName)));
                })
            },
            getIpld(ipldHash) {
                if(ipldHash.multihash) {
                    ipldHash = ipfsHelper.cidToHash(ipldHash);
                }
                return $http.get(`/ipld/${ipldHash}`).then(response => response.data);
            },
            async getGroupPosts(groupId, limit = 10, offset = 0, orderDir = 'desc'){
                const postsPath = groupId + '/posts/';
                return pIteration.map(_.range(offset, offset + limit), (postNumber) => {
                    const postNumberPath = trie.getTreePath(postNumber).join('/');
                    return this.getIpld(postsPath + postNumberPath);
                });
                // return $http.get(`/v1/group/${groupId}/posts`, { params: { limit, offset } }).then(response => response.data);
            },
            getCanCreatePost(groupId){
                return $http.get(`/v1/user/group/${groupId}/can-create-post`).then(response => response.data);
            },
        };
    }
}
