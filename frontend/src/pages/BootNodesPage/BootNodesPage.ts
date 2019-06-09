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

import ChooseFileContentsIdsModal from "../../modals/ChooseFileContentsIdsModal/ChooseFileContentsIdsModal";
import AddBootNodeModal from "../../modals/AddBootNodeModal/AddBootNodeModal";

export default {
    template: require('./BootnodesPage.html'),
    components: {},
    props: [],
    async created() {
        this.getBootNodes();
    },
    methods: {
        async getBootNodes() {
            this.bootNodes = await this.$coreApi.adminGetBootNodes();
            this.currentNodeAddressList = await this.$coreApi.getNodeAddressList();
        },
        addBootNode() {
            this.$root.$asyncModal.open({
                id: 'add-boot-node-modal',
                component: AddBootNodeModal,
                onClose: () => {
                    this.getBootNodes();
                }
            });
        },
        async removeBootNode(address) {
            if(!confirm("Are you sure want to remove " + address + "  boot node?")) {
                return;
            }
            await this.$coreApi.adminRemoveBootNode(address);
            this.getBootNodes();
        }
    },
    watch: {
        
    },
    computed: {
        
    },
    data() {
        return {
            localeKey: 'content_page',
            bootNodes: [],
            currentNodeAddressList: [],
            loading: false
        };
    }
}
