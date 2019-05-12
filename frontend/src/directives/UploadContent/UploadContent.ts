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

export default {
    template: require('./UploadContent.html'),
    props: ['contentId', 'groupId'],
    async created() {

    },

    async mounted() {

    },

    methods: {
        setMode(modeName) {
            this.mode = modeName;
        },
        saveText() {
            this.saving = true;
            this.$coreApi.saveContentData(this.localValue, {groupId: this.groupId}).then(contentObj => {
                this.$emit('update:content-id', contentObj.id);
                this.$emit('uploaded', contentObj.id);
                this.setMode(null);
                this.localValue = '';
                this.saving = false;
            })
        }
    },

    watch: {
        
    },

    computed: {
        contentsList() {
            // return _.orderBy(this.value.contents, ['position'], ['asc']);
        }
    },
    data() {
        return {
            mode: '',
            localValue: '',
            saving: false
        }
    },
}
