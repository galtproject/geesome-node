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

import UploadContent from "../../../directives/UploadContent/UploadContent";
import ContentManifestInfoItem from "../../../directives/ContentManifestInfoItem/ContentManifestInfoItem";

export default {
    template: require('./NewPostControl.html'),
    props: ['group'],
    components: {UploadContent, ContentManifestInfoItem},
    async created() {
        this.fetchData();
    },

    async mounted() {

    },

    methods: {
        async fetchData() {
            if(!this.group) {
                this.canCreatePosts = false;
                return;
            }
            this.canCreatePosts = await this.$coreApi.getCanCreatePost(this.group.id);
        },
        handleUpload(contentId) {
            this.postContentsDbIds.push(contentId);
        },
        deleteContent(index) {
            this.postContentsDbIds.splice(index, 1);
        },
        publishPost() {
            const postContentsDbIds = this.postContentsDbIds;
            this.postContentsDbIds = [];
            this.saving = true;
            this.$coreApi.createPost(postContentsDbIds, {groupId: this.group.id, status: 'published'}).then(() => {
                this.saving = false;
                this.$emit('new-post');
            })
        },
    },

    watch: {
        group() {
            this.fetchData();
        }
    },

    computed: {
        
    },
    data() {
        return {
            localeKey: 'group_page',
            canCreatePosts: false,
            saving: false,
            postContentsDbIds: []
        }
    },
}
