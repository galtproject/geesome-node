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


const config = require('../../config');
const axios = require('axios');

export default {
    name: 'main-page',
    template: require('./MainPage.html'),
    methods: {
        uploadFile(file) {
            this.uploading = true;
            this.$serverApi.saveFile(file, {
                groupId: 1
            }).then(response => {
                this.ipfsHash = response.data;
                this.uploading = false;
            })
        }
    },
    data() {
        return {
            localeKey: 'main_page',
            uploading: false,
            ipfsHash: null
        };
    },
    computed: {
        
    }
}
