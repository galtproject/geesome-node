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

import PrettyName from "../PrettyName/PrettyName";

const _ = require('lodash');
const mime = require('mime/lite');
const fileSaver = require('file-saver');
const ipfsHelper = require('@galtproject/geesome-libs/src/ipfsHelper');

export default {
  template: require('./ContentManifestInfoItem.html'),
  props: ['manifest', 'dbId', 'verticalMode', 'mini'],
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
      const manifestObj = await this.$coreApi.getObject(dbContent.manifestStorageId);
      this.setContentByManifest(manifestObj);
    },
    async setContentByManifest(manifestObj) {
      this.loading = true;

      if (manifestObj) {
        this.manifestObj = manifestObj;
      } else if (ipfsHelper.isIpldHash(this.manifest)) {
        this.manifestObj = await this.$coreApi.getObject(this.manifest);
      } else if (this.manifest) {
        this.manifestObj = this.manifest;
      }
      if (!this.manifestObj) {
        return;
      }

      this.srcLink = await this.$coreApi.getContentLink(this.manifestObj.content);

      if (this.type == 'text') {
        this.content = await this.$coreApi.getContentData(this.manifestObj.content);
      }
      if (this.type == 'image' || this.type == 'file') {
        this.content = this.srcLink;
      }
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
      content: '',
      srcLink: '',
      loading: true
    }
  },
}
