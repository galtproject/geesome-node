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

export default {
    install (Vue, options: any = {}) {
        let $http = axios.create({
            baseURL: config.serverBaseUrl,
            headers: {'Authorization': 'unauthorized'}
        });
        
        let $httpUnauthorized = axios.create({
            baseURL: config.serverBaseUrl,
            headers: {'Authorization': 'unauthorized'}
        });

        let accountAddress;
        let currentSignature;
        let currentMessage;
        let web3NotSupported = false;
        
        let headersReady = false;
        
        Vue.prototype.$dcityTokenSale = {
            setWeb3NotSupported(_web3NotSupported){
                web3NotSupported = _web3NotSupported;
                this.updateHeaders();
            },
            setAccountAddress(_accountAddress){
                accountAddress = _accountAddress;
                this.updateHeaders();
            },
            getCachedSignature: function(messageToSign) {
                currentSignature = localStorage.getItem(accountAddress + ':' + messageToSign);
                this.updateHeaders();
                return currentSignature;
            },
            setCachedSignature: function(messageToSign, signature) {
                currentSignature = signature;
                localStorage.setItem(accountAddress + ':' + messageToSign, signature);
                this.updateHeaders();
            },
            updateHeaders: function() {
                let authorization = '';
                if(web3NotSupported || !accountAddress || !currentSignature) {
                    authorization = 'unauthorized';
                } else {
                    authorization = `account=${accountAddress}&signature=${currentSignature}`;
                }
                
                // $http.defaults.headers.common['Authorization'] = authorization;

                $http = axios.create({
                    baseURL: config.serverBaseUrl,
                    headers: {'Authorization': authorization}
                });
                
                if(accountAddress && currentSignature) {
                    const recoveredAddress = EthData.recoverSignatureAddress(currentMessage, currentSignature);
                    headersReady = recoveredAddress.toLowerCase() === accountAddress.toLowerCase();
                } else {
                    headersReady = web3NotSupported;
                }
            },
            onHeadersReady: async function() {
                if(headersReady) {
                    return;
                } else {
                    return new Promise((resolve, reject) => {
                        const intervalId = setInterval(() => {
                            if(headersReady) {
                                resolve();
                                clearInterval(intervalId);
                            }
                        }, 100);
                    });
                }
            },
            getAuthMessage: async function() {
                const response: any = await $httpUnauthorized.get('v1/get-auth-message');
                currentMessage = response.data.message;
                return currentMessage;
            },
            isSignatureValid: async function(signature) {
                const response = await $httpUnauthorized.post('v1/check-signature', {
                    signature,
                    accountAddress
                });
                return response.data.valid;
            },
            getExplorerTemplates: async function() {
                const response = await $httpUnauthorized.get('v1/explorer-templates');
                return response.data;
            },
            getTokensRate: async function() {
                const response = await $httpUnauthorized.get('v1/tokens-rate');
                return parseFloat(response.data.rate);
            },
            createOrder: async function(orderData) {
                await this.onHeadersReady();
                return $http.post('v1/create-order', orderData);
            },
            checkOrder: async function(orderId) {
                await this.onHeadersReady();
                return $http.get('v1/check-order/' + orderId);
            },
            getPrevOrders: async function() {
                await this.onHeadersReady();
                const response = await $http.get('v1/orders?accountAddress=' + accountAddress);
                return response.data;
            }
        };
    }
}
