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

import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";
import EthData from "@galtproject/frontend-core/libs/EthData";
import GroupItem from "../GroupsList/GroupItem/GroupItem";
import PostItem from "../../directives/Posts/PostItem/PostItem";

const ipfsHelper = require('../../../../libs/ipfsHelper');

export default {
    template: require('./ContentPage.html'),
    components: {ContentManifestInfoItem, GroupItem, PostItem},
    props: [],
    created() {
        this.inputManifestId = this.manifestId;
        this.type = this.$route.query.type || 'content';
        if(this.manifestId) {
            this.getManifest();
        }
    },
    methods: {
        setManifestIdRoute() {
            this.$router.push({params: {manifestId: this.inputManifestId}});
        },
        async getManifest() {
            this.loading = true;
            let manifestId = this.manifestId;
            if(ipfsHelper.isIpfsHash(manifestId)) {
                manifestId = await this.$coreApi.resolveIpns(manifestId);
            }
            this.manifest = await this.$coreApi.getIpld(manifestId);
            this.type = this.manifest._type.split('-')[0];
            if(this.type === 'group') {
                await this.$coreApi.fetchIpldFields(this.manifest, ['avatarImage', 'coverImage']);
                this.subManifests = await this.$coreApi.getGroupPosts(manifestId)
            }
            this.loading = false;
        }
    },
    watch: {
        async manifestId() {
            this.inputManifestId = this.manifestId;
            this.getManifest();
        }
    },
    computed: {
        manifestId() {
            return this.$route.params.manifestId;
        },
        humanReadableType() {
            return EthData.humanizeKey(this.type);
        }
    },
    data() {
        return {
            localeKey: 'content_page',
            inputManifestId: '',
            manifest: null,
            subManifests: [],
            type: '',
            loading: false
        };
    }
}
