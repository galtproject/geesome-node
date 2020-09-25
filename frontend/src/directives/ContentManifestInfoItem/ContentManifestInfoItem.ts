/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import PrettyName from "../PrettyName/PrettyName";

const _ = require('lodash');
const mime = require('mime/lite');
const fileSaver = require('file-saver');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

export default {
  template: require('./ContentManifestInfoItem.html'),
  props: ['manifest', 'dbId', 'verticalMode', 'mini', 'fullMode'],
  components: {PrettyName},
  async created() {
    this.setContent();
  },

  async mounted() {

  },

  methods: {
    setContent() {
      if (this.dbId) {
        this.setContentByDbId();
      } else {
        this.setContentByManifest();
      }
    },
    async setContentByDbId() {
      this.loading = true;
      const dbContent = await this.$coreApi.getDbContent(this.dbId);
      this.manifestId = dbContent.manifestStorageId;
      const manifestObj = await this.$coreApi.getObject(dbContent.manifestStorageId);
      this.setContentByManifest(manifestObj);
    },
    async setContentByManifest(manifestObj) {
      this.loading = true;

      if (manifestObj) {
        this.manifestObj = manifestObj;
      } else if (ipfsHelper.isIpldHash(this.manifest)) {
        this.manifestId = this.manifest;
        this.manifestObj = await this.$coreApi.getObject(this.manifest);
      } else if (this.manifest) {
        this.manifestObj = this.manifest;
      }
      if (!this.manifestObj) {
        return;
      }

      this.srcLink = await this.$coreApi.getContentLink(this.manifestObj.storageId);

      if (this.type == 'text') {
        this.content = await this.$coreApi.getContentData(this.manifestObj.storageId);
      }
      if (this.type == 'image' || this.type == 'file') {
        this.content = this.srcLink;
      }
      
      //TODO: fix error "Path is not pinned"
      // this.pins = await this.$coreApi.getStorageIdPins('/ipfs/' + this.manifestObj.storageId);
      
      this.loading = false;
    },
    download() {
      fileSaver.saveAs(this.srcLink, this.filename);
    }
  },

  watch: {
    type() {
      this.setContent();
    },
    dbId() {
      this.setContentByDbId();
    }
  },

  computed: {
    filename() {
      return _.last(this.srcLink.split('/')) + '.' + this.extension;
    },
    type() {
      if (!this.manifestObj) {
        return null;
      }
      if (_.startsWith(this.manifestObj.mimeType, 'image')) {
        return 'image';
      }
      if (_.startsWith(this.manifestObj.mimeType, 'text')) {
        return 'text';
      }
      return 'file';
    },
    extension() {
      if (!this.manifestObj) {
        return null;
      }
      return this.manifestObj.extension || mime.getExtension(this.manifestObj.mimeType) || '';
    },
    showCloseButton() {
      return !!this.$listeners.close;
    },
    slashesSrcLink() {
      return this.srcLink.replace('http:', '').replace('https:', '');
    }
  },
  data() {
    return {
      manifestObj: null,
      manifestId: null,
      content: '',
      srcLink: '',
      loading: true,
      pins: null
    }
  },
}
