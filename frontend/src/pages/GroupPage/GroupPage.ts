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

import PostItem from "../../directives/PostItem/PostItem";
import UploadContent from "../../directives/UploadContent/UploadContent";

export default {
    template: require('./GroupPage.html'),
    components: {PostItem, UploadContent},
    async created() {
        this.group = await this.$serverApi.getGroup(this.groupId);
        this.getPosts();
    },
    methods: {
        async getPosts() {
            this.loading = true;
            this.posts = await this.$serverApi.getGroupPosts(this.groupId, 10, 0);
            this.loading = false;
        }
    },
    watch: {
        groupId() {
            this.getPosts();
        }
    },
    computed: {
        groupId() {
            return this.$route.params.groupId;
        }
    },
    data() {
        return {
            localeKey: 'group_page',
            posts: [],
            loading: true
        };
    }
}
