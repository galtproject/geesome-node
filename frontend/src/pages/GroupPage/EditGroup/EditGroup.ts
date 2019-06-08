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

import {EventBus, UPDATE_ADMIN_GROUPS} from "../../../services/events";
import ContentManifestItem from "../../../directives/ContentManifestItem/ContentManifestItem";
import GroupForm from "../GroupForm/GroupForm";

export default {
    template: require('./EditGroup.html'),
    components: {ContentManifestItem, GroupForm},
    async created() {
        this.group = await this.$coreApi.getDbGroup(this.$route.params.groupId);
    },
    methods: {
        update() {
            this.$coreApi.updateGroup(this.group).then((updatedGroup) => {
                EventBus.$emit(UPDATE_ADMIN_GROUPS);
                this.$router.push({name: 'group-page', params: {groupId: updatedGroup.manifestStaticStorageId}})
            }).catch(() => {
                this.error = 'failed';
            })
        }
    },
    computed: {
        
    },
    data() {
        return {
            localeKey: 'edit_group',
            group: null,
            error: null,
            invalidInputs: true
        };
    }
}
