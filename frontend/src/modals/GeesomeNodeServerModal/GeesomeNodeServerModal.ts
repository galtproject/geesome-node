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

import {ModalItem} from '@galtproject/frontend-core/modals/AsyncModal'

export default {
    template: require('./GeesomeNodeServerModal.html'),
    props: [],
    components: {
        ModalItem
    },
    created() {
        this.serverAddress = this.currentServerAddress;
    },
    methods: {
        async ok() {
            this.$coreApi.changeServer(this.serverAddress);
            this.$root.$asyncModal.close('geesome-node-server-modal');
        },
        async cancel() {
            this.$root.$asyncModal.close('geesome-node-server-modal');
        }
    },
    watch: {},
    computed: {
        currentServerAddress() {
            return this.$store.state.serverAddress;
        }
    },
    data: function () {
        return {
            serverAddress: ''
        }
    }
}
