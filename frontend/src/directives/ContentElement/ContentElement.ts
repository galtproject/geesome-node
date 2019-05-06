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

const config = require('../../../config');
const _ = require('lodash');

export default {
    template: require('./ContentElement.html'),
    props: ['src'],
    async created() {
        
    },

    async mounted() {

    },

    methods: {
        
    },

    watch: {
        async isText() {
            if(!this.isText) {
                return;
            }
            this.textContent = await this.$serverApi.getContent(this.src.storageId);
        },
        async isImg() {
            if(!this.isImg) {
                return;
            }
            this.imgSrc = config.serverBaseUrl + 'v1/get-content/' + this.src.storageId;
        }
    },

    computed: {
        isImg() {
            return _.startsWith(this.src.type, 'image');
        },
        isText() {
            return _.startsWith(this.src.type, 'text');
        }
    },
    data() {
        return {
            textContent: '',
            imgSrc: ''
        }
    },
}
