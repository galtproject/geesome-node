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
// const config = require('../../config');
const _ = require('lodash');
const pIteration = require('p-iteration');
const ipfsHelper = require('../../../libs/ipfsHelper');
const trie = require('../../../libs/trie');
// import {JsIpfsService} from "../../../components/storage/JsIpfsService";
//
// const IPFS = require('ipfs-http-client');
//
// const node = new IPFS({ host: config.serverBaseUrl.split('://')[1], port: '5001', protocol: config.serverBaseUrl.split('://')[0] });
// const ipfsService = new JsIpfsService(node);
    
export default {
    install (Vue, options: any = {}) {
        let $http = axios.create({
            // baseURL: config.serverBaseUrl,
            // headers: {'Authorization': 'unauthorized'},
            // withCredentials: true,
            // mode: 'no-cors',
        });
        
        let current;

        getApiKey();
        
        function wrap(httPromise) {
            return httPromise.then(response => response.data).catch(data => {
                throw (data.response.data);
            });
        }
        
        function setApiKey(apiKey) {
            localStorage.setItem('geesome-api-key', apiKey);
            $http.defaults.headers.post['Authorization'] = 'Bearer ' + apiKey;
            $http.defaults.headers.get['Authorization'] = 'Bearer ' + apiKey;
        }
        function getApiKey() {
            const apiKey = localStorage.getItem('geesome-api-key');
            $http.defaults.headers.post['Authorization'] = 'Bearer ' + apiKey;
            $http.defaults.headers.get['Authorization'] = 'Bearer ' + apiKey;
        }
        
        Vue.prototype.$coreApi = {
            init(store) {
                $http.defaults.baseURL = store.state.serverAddress;
            },
            getCurrentUser(){
                return wrap($http.get('/v1/user'));
            },
            login(username, password){
                return wrap($http.post('/v1/login', {username, password})).then(data => {
                    setApiKey(data.apiKey);
                    return data;
                });
            },
            createGroup(groupData){
                return wrap($http.post(`/v1/user/create-group`, groupData));
            },
            saveFile(file, params = {}){
                const formData = new FormData();
                
                _.forEach(params, (value, key) => {
                    formData.append(key, value);
                });
                
                formData.append("file", file);
                return wrap($http.post('/v1/user/save-file', formData, {  headers: { 'Content-Type': 'multipart/form-data' } }));
            },
            saveContentData(content, params = {}){
                return wrap($http.post('/v1/user/save-data', _.extend({content}, params)));
            },
            saveDataByUrl(url, params = {}){
                return wrap($http.post('/v1/user/save-data-by-url', _.extend({url}, params)));
            },
            createPost(contentsIds, params: any = {}){
                return wrap($http.post(`/v1/user/group/${params.groupId}/create-post`, _.extend({contentsIds}, params)));
            },
            getContentData(storageId){
                return wrap($http.get('/v1/content-data/' + storageId));
            },
            getDbContent(dbId){
                return wrap($http.get('/v1/content/' + dbId));
            },
            getMemberInGroups(){
                //TODO: get groups list directly from ipld
                return wrap($http.get('/v1/user/member-in-groups')).then(groups => {
                    return pIteration.map(groups, (group) => this.getGroup(group.manifestStorageId))
                });
            },
            getAdminInGroups(){
                //TODO: get groups list directly from ipld
                return wrap($http.get('/v1/user/admin-in-groups')).then(groups => {
                    return pIteration.map(groups, (group) => this.getGroup(group.manifestStorageId))
                });
            },
            async getGroup(groupId){
                if(ipfsHelper.isIpfsHash(groupId)) {
                    groupId = await this.resolveIpns(groupId);
                }
                
                const groupObj = await this.getIpld(groupId);
                groupObj.id = groupId;
                
                await this.fetchIpldFields(groupObj, ['avatarImage', 'coverImage']);
                
                return groupObj;
                // return $http.get(`/v1/group/${groupId}`).then(response => response.data);
            },
            async fetchIpldFields(obj, fieldsNamesArr) {
                await pIteration.forEach(fieldsNamesArr, async (fieldName) => {
                    if(!_.get(obj, fieldName)) {
                        return;
                    }
                    _.set(obj, fieldName, await this.getIpld(_.get(obj, fieldName)));
                })
            },
            async getImageLink(image) {
                if(!image) {
                    return null;
                }
                let storageId;
                if(image.content) {
                    storageId = image.content;
                } 
                if(ipfsHelper.isIpldHash(storageId)) {
                    storageId = (await this.getIpld(storageId)).content;
                }
                if(!storageId) {
                    storageId = image;
                }
                return $http.defaults.baseURL + '/v1/content-data/' + storageId;
            },
            async getIpld(ipldHash) {
                if(ipldHash.multihash || ipldHash.hash) {
                    ipldHash = ipfsHelper.cidToHash(ipldHash);
                }
                if(ipldHash['/']) {
                    ipldHash = ipldHash['/'];
                }
                return wrap($http.get(`/ipld/${ipldHash}`));
            },
            async getGroupPosts(groupId, limit = 10, offset = 0, orderDir = 'desc'){
                const group = await this.getGroup(groupId);
                const postsCount = parseInt(group.postsCount);
                if(offset + limit > postsCount) {
                    limit = postsCount - offset;
                }
                
                const postsPath = group.id + '/posts/';
                return (await pIteration.map(_.range(postsCount - offset, postsCount - offset - limit), async (postNumber) => {
                    const postNumberPath = trie.getTreePath(postNumber).join('/');
                    const post = await this.getIpld(postsPath + postNumberPath);
                    post.id = postNumber;
                    post.groupId = groupId;
                    if(post) {
                        post.group = group;
                    }
                    return post;
                })).filter(post => post);
                // return $http.get(`/v1/group/${groupId}/posts`, { params: { limit, offset } }).then(response => response.data);
            },
            async getGroupPost(groupId, postId){
                const group = await this.getGroup(groupId);
                const postsPath = group.id + '/posts/';
                const postNumberPath = trie.getTreePath(postId).join('/');
                const post = await this.getIpld(postsPath + postNumberPath);
                post.id = postId;
                post.groupId = groupId;
                post.group = group;
                return post;
            },
            getCanCreatePost(groupId){
                return wrap($http.get(`/v1/user/group/${groupId}/can-create-post`)).then(data => data.valid);
            },
            resolveIpns(ipns){
                return wrap($http.get(`/resolve/${ipns}`));
            },
            getFileCatalogItems(parentItemId, type?, sortBy?, sortDir?, limit?, offset?){
                return wrap($http.get(`/v1/user/file-catalog/`, {params: {parentItemId, type, sortField: sortBy, sortDir, limit, offset}}));
            },
            getFileCatalogBreadcrumbs(itemId){
                return wrap($http.get(`/v1/user/file-catalog/breadcrumbs/${itemId}`));
            },
            getContentsIdsByFileCatalogIds(fileCatalogIds) {
                return wrap($http.post(`/v1/file-catalog/get-contents-ids`, fileCatalogIds));
            },
            getAllItems(itemsName, search?, sortField?, sortDir?, limit?, offset?) {
                return wrap($http.get(`/v1/admin/all-` + itemsName, { params: {search, sortField, sortDir, limit, offset}}));
            },
            adminCreateUser(userData){
                return wrap($http.post(`/v1/admin/add-user`, userData));
            },
            adminSetUserLimit(limitData){
                return wrap($http.post(`/v1/admin/set-user-limit`, limitData));
            },
            adminAddUserAPiKey(userId){
                return wrap($http.post(`/v1/admin/add-user-api-key`, { userId }));
            },
        };
    }
}
