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

import ContentManifestInfoItem from "../ContentManifestInfoItem/ContentManifestInfoItem";

export default {
    name: 'file-catalog',
    template: require('./FileCatalog.html'),
    components: { ContentManifestInfoItem },
    props: ['selectedIds'],
    async created() {
        this.getItems();
        this.localSelectedIds = this.selectedIds || [];
    },

    async mounted() {
        
    },

    methods: {
        async getItems() {
            this.loading = true;
            this.folders = await this.$coreApi.getFileCatalogItems(this.parentItemId, 'folder');
            this.files = await this.$coreApi.getFileCatalogItems(this.parentItemId, 'file');
            this.loading = false;
        },
        async getBreadcrumbs() {
            if(!this.parentItemId) {
                this.breadcrumbs = [];
                return;
            }
            this.breadcrumbs = await this.$coreApi.getFileCatalogBreadcrumbs(this.parentItemId);
        },
        openFolder (item) {
            this.parentItemId = item.id;
            this.getItems();
            this.getBreadcrumbs();
        },
        getLocale(key, options?) {
            return this.$locale.get(this.localeKey + "." + key, options);
        }
    },

    watch: {
        localSelectedIds() {
            this.$emit('update:selected-ids', this.localSelectedIds);
        }
    },

    computed: {
        user() {
            return this.$store.state.user;
        }
    },
    data() {
        return {
            localeKey: 'file_catalog',
            loading: true,
            parentItemId: null,
            breadcrumbs: [],
            folders: [],
            files: [],
            localSelectedIds: []
        }
    },
}
