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

import GeesomeNodeServerModal from "../../../../modals/GeesomeNodeServerModal/GeesomeNodeServerModal";

export default {
    template: require('./WelcomeToGeesome.html'),
    components: {},
    props: [],
    async created() {
        
    },
    methods: {
        connectToNode() {
            this.$root.$asyncModal.open({
                id: 'geesome-node-server-modal',
                component: GeesomeNodeServerModal
            });
        }
    },
    watch: {
        
    },
    computed: {
        user() {
            return this.$store.state.user;
        }
    },
    data() {
        return {
            localeKey: 'widgets.welcome_to_geesome',
        };
    }
}
