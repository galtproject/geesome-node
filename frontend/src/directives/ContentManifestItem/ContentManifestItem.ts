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
    template: require('./ContentManifestItem.html'),
    props: ['manifest'],
    async created() {
        this.setContent();
    },

    async mounted() {

    },

    methods: {
        async setContent() {
            if(this.type == 'text') {
                this.content = await this.$serverApi.getContentData(this.manifest.storageId);
            }
            if(this.type == 'image' || this.type == 'file') {
                this.content = this.$serverApi.getImageLink(this.manifest.storageId);
            }
        }
    },

    watch: {
        type() {
            this.setContent();
        }
    },

    computed: {
        type() {
            if(_.startsWith(this.manifest.type, 'image')) {
                return 'image';
            }
            if(_.startsWith(this.manifest.type, 'text')) {
                return 'text';
            }
            return 'file';
        }
    },
    data() {
        return {
            content: ''
        }
    },
}
