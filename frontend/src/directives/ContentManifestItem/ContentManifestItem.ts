/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import MediaElement from "geesome-vue-components/src/directives/MediaElement/MediaElement";
import PrettyName from "../PrettyName/PrettyName";
import ImageModal from "../../modals/ImageModal/ImageModal";

const fileSaver = require('file-saver');
const mime = require('mime/lite');
const _ = require('lodash');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

export default {
  template: require('./ContentManifestItem.template'),
  props: ['manifest', 'dbId', 'previewMode', 'storageId', 'type', 'extension'],
  components: {MediaElement, PrettyName, ImageModal},
  async created() {
  },
  async mounted() {
    this.setContent();
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
      const dbContent = await this.$geesome.getDbContent(this.dbId);
      const manifestObj = await this.$geesome.getObject(dbContent.manifestStorageId);
      this.setContentByManifest(manifestObj);
    },
    async setContentByManifest(manifestObj) {
      this.loading = true;
      
      this.content = null;
      this.srcLink = null;
      this.previewSrcLink = null;
      
      if (manifestObj) {
        this.manifestObj = manifestObj;
      } else if (ipfsHelper.isObjectCidHash(this.manifest)) {
        this.manifestObj = await this.$geesome.getObject(this.manifest);
      } else if (this.manifest && this.manifest['/']) {
        this.manifestObj = await this.$geesome.getObject(this.manifest['/']);
      } else {
        this.manifestObj = this.manifest;
      }

      let contentId = this.storageId || this.manifestContentId;

      if (!this.manifestObj && !contentId) {
        return;
      }

      let previewStorageId = this.manifestPreviewContentId || contentId;

      this.srcLink = await this.$geesome.getContentLink(contentId);
      this.previewSrcLink = await this.$geesome.getContentLink(previewStorageId);

      if (this.resultType == 'text') {
        this.content = await this.$geesome.getContentData(contentId);
      }
      if (this.resultType == 'image' || this.resultType == 'video' || this.resultType == 'audio' || this.resultType == 'file') {
        this.content = this.srcLink + (this.resultExtension ? '.' + this.resultExtension : '');
      }
      this.loading = false;
    },
    download() {
      fileSaver.saveAs(this.srcLink, this.filename);
    },
    openImage() {
      this.$root.$asyncModal.open({
        id: 'image-modal',
        component: ImageModal,
        props: {'images': [this.srcLink]},
        options: {closeOnBackdrop: true}
      });
    }
  },

  watch: {
    extension() {
      this.setContent();
    },
    resultType() {
      this.setContent();
    },
    manifest() {
      this.setContent();
    },
    dbId() {
      this.setContentByDbId();
    }
  },

  computed: {
    resultType() {
      return this.type || this.manifestType;
    },
    resultExtension() {
      return this.extension || this.manifestExtension;
    },
    filename() {
      return _.last(this.srcLink.split('/')) + '.' + this.extension;
    },
    manifestType() {
      if (!this.manifestObj) {
        return null;
      }
      if (_.startsWith(this.contentType, 'image')) {
        return 'image';
      }
      if (_.startsWith(this.contentType, 'text')) {
        return 'text';
      }
      if (_.startsWith(this.contentType, 'video')) {
        return 'video';
      }
      if (_.startsWith(this.contentType, 'audio')) {
        return 'audio';
      }
      return 'file';
    },
    contentType() {
      return this.previewMode && this.manifestObj.preview ? this.manifestObj.preview.medium.mimeType : this.manifestObj.mimeType;
    },
    manifestPreviewContentId() {
      return this.manifestObj && this.manifestObj.preview && this.manifestObj.preview.medium.storageId;
    },
    manifestContentId() {
      return (this.previewMode ? this.manifestPreviewContentId : null) || (this.manifestObj || {})['storageId'];
    },
    manifestExtension() {
      if (!this.manifestObj) {
        return null;
      }
      return this.manifestObj.extension || mime.getExtension(this.manifestObj.mimeType) || '';
    }
  },
  data() {
    return {
      manifestObj: null,
      content: '',
      previewSrcLink: null,
      srcLink: null
    }
  },
}
