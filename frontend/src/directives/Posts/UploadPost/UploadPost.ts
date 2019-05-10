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

import UploadContent from "../../UploadContent/UploadContent";

export default {
    template: require('./UploadPost.html'),
    props: ['contentId', 'groupId'],
    components: {UploadContent},
    async created() {

    },

    async mounted() {

    },

    methods: {
        getContents() {
            
        }
    },

    watch: {
        newContentId() {
            if(!this.newContentId) {
                return;
            }
            
            this.contentsIds.push(this.newContentId);
            this.newContentId = null;
        }
    },

    computed: {
        
    },
    data() {
        return {
            newContentId: null,
            contentsIds: [],
            saving: false
        }
    },
}
