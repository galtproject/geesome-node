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

export default {
    install (Vue, options: any = {}) {
        let $http = axios.create({
            baseURL: config.serverBaseUrl,
            headers: {'Authorization': 'unauthorized'}
        });
        
        Vue.prototype.$serverApi = {
            saveFile(file, params = {}){
                const formData = new FormData();
                
                _.forEach(params, (value, key) => {
                    formData.append(key, value);
                });
                
                formData.append("file", file);
                return $http.post('/v1/save-file', formData, {  headers: { 'Content-Type': 'multipart/form-data' } }).then(response => response.data);
            },
            getContent(storageId){
                return $http.get('/v1/get-content/' + storageId).then(response => response.data);
            },
            getMemberInGroups(){
                return $http.get('/v1/get-member-in-groups').then(response => response.data);
            },
            getAdminInGroups(){
                return $http.get('/v1/get-admin-in-groups').then(response => response.data);
            },
            getGroupPosts(groupId, limit = 10, offset = 0, orderDir = 'desc'){
                return $http.get('/v1/get-group-posts/' + groupId, { params: { limit, offset } }).then(response => response.data);
            }
        };
    }
}
