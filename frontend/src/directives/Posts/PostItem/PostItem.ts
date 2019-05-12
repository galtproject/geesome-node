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

export default {
    template: require('./PostItem.html'),
    props: ['value'],
    async created() {
        this.getGroup();
    },

    async mounted() {

    },

    methods: {
        async getGroup() {
            if(this.value.group) {
                this.group = this.value.group;
                return;
            }
            if(!this.value.groupId) {
                this.group = null;
                return;
            }
            this.group = await this.$coreApi.getGroup(this.value.groupId);
        }
    },

    watch: {
        value() {
            this.getGroup();
        }
    },

    computed: {
        contentsList() {
            return _.orderBy(this.value.contents, ['position'], ['asc']);
        }
    },
    data() {
        return {
            group: null,
            content: ''
        }
    },
}
