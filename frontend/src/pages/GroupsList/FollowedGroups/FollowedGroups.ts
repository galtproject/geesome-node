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

// import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";

export default {
    template: require('./ContentPage.html'),
    // components: {ContentManifestInfoItem},
    props: [],
    async created() {
        this.inputContentId = this.contentId;
    },
    methods: {
        setContentIdRoute() {
            this.$router.push({params: {contentId: this.inputContentId}})
        }
    },
    watch: {
        contentId() {
            this.inputContentId = this.contentId;
        }
    },
    computed: {
        contentId() {
            return this.$route.params.contentId;
        }
    },
    data() {
        return {
            localeKey: 'content_page',
            inputContentId: ''
        };
    }
}
