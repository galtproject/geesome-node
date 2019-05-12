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

const _ = require('lodash');
const ipfsHelper = require('../../../../libs/ipfsHelper');

export default {
    template: require('./ContentManifestInfoItem.html'),
    props: ['manifest', 'dbId'],
    async created() {
        if(this.dbId) {
            this.setContentByDbId();
        } else {
            this.setContent();
        }
    },

    async mounted() {

    },

    methods: {
        async setContentByDbId(){
            this.loading = true;
            this.manifestObj = null;
            const dbContent = await this.$coreApi.getDbContent(this.dbId);
            this.manifestObj = await this.$coreApi.getIpld(dbContent.manifestStorageId);
            this.setContent();
        },
        async setContent() {
            this.loading = true;
            if(ipfsHelper.isIpldHash(this.manifest)) {
                this.manifestObj = await this.$coreApi.getIpld(this.manifest);
            } else if(this.manifest) {
                this.manifestObj = this.manifest;
            }
            if(this.type == 'text') {
                this.content = await this.$coreApi.getContentData(this.manifestObj.content);
            }
            if(this.type == 'image' || this.type == 'file') {
                this.content = await this.$coreApi.getImageLink(this.manifestObj.content);
            }
            this.loading = false;
        }
    },

    watch: {
        type() {
            this.setContent();
        },
        dbId() {
            this.setContentByDbId();
        }
    },

    computed: {
        type() {
            if(!this.manifestObj) {
                return null;
            }
            if(_.startsWith(this.manifestObj.type, 'image')) {
                return 'image';
            }
            if(_.startsWith(this.manifestObj.type, 'text')) {
                return 'text';
            }
            return 'file';
        },
        showCloseButton() {
            return !!this.$listeners.close;
        }
    },
    data() {
        return {
            manifestObj: null,
            content: '',
            loading: true
        }
    },
}
