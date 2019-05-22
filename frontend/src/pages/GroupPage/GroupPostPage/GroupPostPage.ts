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

import PostItem from "../../../directives/Posts/PostItem/PostItem";

export default {
    template: require('./GroupPostPage.html'),
    components: {PostItem},
    props: ['group'],
    async created() {
        this.getPost();
    },
    methods: {
        async getPost() {
            this.loading = true;
            this.post = await this.$coreApi.getGroupPost(this.groupId, this.postId);
            this.loading = false;
        }
    },
    watch: {
        groupId() {
            this.getPost();
        },
        postId() {
            this.getPost();
        }
    },
    computed: {
        groupId() {
            return this.$route.params.groupId;
        },
        postId() {
            return this.$route.params.postId;
        }
    },
    data() {
        return {
            localeKey: 'group_post_page',
            post: null,
            loading: true
        };
    }
}
