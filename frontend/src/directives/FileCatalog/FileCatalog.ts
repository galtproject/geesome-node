/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ContentManifestInfoItem from "../ContentManifestInfoItem/ContentManifestInfoItem";
import Pagination from "@galtproject/frontend-core/directives/Pagination/Pagination";
import MoveFileCatalogItemInput from "./MoveFileCatalogItem/MoveFileCatalogItemInput/MoveFileCatalogItemInput";
import {EventBus} from "../../services/events";
import {EVENT_COMPLETE_MOVE_FILE_CONTAINER} from "./MoveFileCatalogItem/events";

export default {
  name: 'file-catalog',
  template: require('./FileCatalog.html'),
  components: {ContentManifestInfoItem, Pagination, MoveFileCatalogItemInput},//UploadContent,
  props: ['selectMode', 'selectedIds', 'hideMethods'],
  async created() {
    this.getItems();
    this.getBreadcrumbs();
    this.localSelectedIds = this.selectedIds || [];
    EventBus.$on(EVENT_COMPLETE_MOVE_FILE_CONTAINER, () => {
      this.getItems();
      this.getBreadcrumbs();
    });
  },

  async mounted() {

  },

  methods: {
    async getItems() {
      await this.getFolders();
      await this.getFiles();
    },
    async getFolders() {
      this.loading = true;
      this.folders = await this.$coreApi.getFileCatalogItems(this.parentItemId || 'null', 'folder', {
        limit: this.foldersPerPage,
        offset: (this.foldersCurrentPage - 1) * this.foldersPerPage
      });
      this.loading = false;
    },
    async getFiles() {
      this.loading = true;
      this.files = await this.$coreApi.getFileCatalogItems(this.parentItemId || 'null', 'file', {
        limit: this.filesPerPage,
        offset: (this.filesCurrentPage - 1) * this.foldersPerPage
      });
      this.loading = false;
    },
    async getBreadcrumbs() {
      if (!this.parentItemId) {
        this.breadcrumbs = [];
        return;
      }
      this.breadcrumbs = await this.$coreApi.getFileCatalogBreadcrumbs(this.parentItemId);
    },
    openFolder(item) {
      this.$router.push({query: {parent: item.id}});
      this.currentFile = null;
    },
    showFile(file) {
      this.currentFile = file;
      console.log('this.currentFile', this.currentFile);
    },
    addFolder() {
      this.showNewFolder = !this.showNewFolder;
    },
    saveFolder() {
      this.$coreApi.createFolder(this.parentItemId, this.newFolder.name).then(() => {
        this.newFolder.name = '';
        this.getItems();
        this.$notify({
          type: 'success',
          title: "Success"
        });
        this.showNewFolder = false;
      }).catch(() => {
        this.$notify({
          type: 'error',
          title: "Error",
          text: "Maybe already exist item with same name in same folder"
        });
      })
    },
    uploadFile() {
      this.showNewFile = !this.showNewFile;
    },
    fileUploaded(data) {
      if (data.method === 'choose-uploaded') {
        this.$coreApi.addContentIdToFolderId(data.id, this.parentItemId).then(() => {
          this.getItems();
        })
      } else {
        this.getItems();
      }

      this.showNewFile = false;
    },
    deleteFile(fileItem) {
      if(!confirm("Are you sure you want to delete file with content?")) {
        return;
      }
      this.$coreApi.deleteFileCatalogItem(fileItem.id, {deleteContent: true}).then(() => {
        this.getItems();
      })
    },
    getLocale(key, options?) {
      return this.$locale.get(this.localeKey + "." + key, options);
    }
  },

  watch: {
    localSelectedIds() {
      this.$emit('update:selected-ids', this.localSelectedIds);
    },
    filesCurrentPage() {
      this.getFiles()
    },
    foldersCurrentPage() {
      this.getFolders()
    },
    parentItemId() {
      console.log('parentItemId', this.parentItemId);
      this.getItems();
      this.getBreadcrumbs();
    }
  },

  computed: {
    filesList() {
      return this.files ? this.files.list || [] : [];
    },
    filesTotal() {
      return this.files ? this.files.total : null;
    },
    foldersList() {
      return this.folders ? this.folders.list || [] : [];
    },
    foldersTotal() {
      return this.folders ? this.folders.total : null;
    },
    user() {
      return this.$store.state.user;
    },
    parentItemId() {
      return this.$route.query.parent || null;
    }
  },
  data() {
    return {
      localeKey: 'file_catalog',
      loading: true,
      breadcrumbs: [],
      folders: [],
      files: [],
      localSelectedIds: [],
      currentFile: null,
      showNewFolder: false,
      newFolder: {
        name: ''
      },
      showNewFile: false,
      filesPerPage: 20,
      foldersPerPage: 20,
      foldersCurrentPage: 1,
      filesCurrentPage: 1
    }
  },
}
