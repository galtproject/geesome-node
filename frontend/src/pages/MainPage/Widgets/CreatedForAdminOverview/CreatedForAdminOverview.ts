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

import PrettyName from "../../../../directives/PrettyName/PrettyName";

export default {
    template: require('./CreatedForAdminOverview.html'),
    components: {PrettyName},
    props: [],
    async created() {
        this.getItems();
    },
    methods: {
        async getItems() {
            this.items = [];
            this.loading = true;
            
            this.items = await this.$coreApi.getAllItems(this.activeTab, this.search, 'createdAt', 'desc');
            
            this.loading = false;
        },
        setActiveTab(tabName) {
            this.activeTab = tabName;
        }
    },
    watch: {
        activeTab() {
            this.getItems();
        }
    },
    computed: {
        
    },
    data() {
        return {
            localeKey: 'widgets.created_for_admin_overview',
            search: '',
            items: [],
            activeTab: 'content',
            loading: true
        };
    }
}
