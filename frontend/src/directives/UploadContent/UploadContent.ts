/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ChooseContentsIdsModal from "../../modals/ChooseContentsIdsModal/ChooseContentsIdsModal";

const _ = require('lodash');
const pIteration = require('p-iteration');
const detecterLib = require('geesome-libs/src/detecter');

export default {
  name: 'upload-content',
  template: require('./UploadContent.template'),
  props: ['contentId', 'groupId', 'folderId', 'hideMethods'],
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
      const fileName = this.localValue.replace(/(<([^>]+)>)/ig, "").slice(0, 50) + '.html';
      this.$geesome.saveContentData(this.localValue, {
        groupId: this.groupId,
        fileName,
        folderId: this.folderId
      })
        .then(this.contentUploaded.bind(this))
        .catch(() => {this.saving = false;});
    },
    async uploadFiles(files) {
      const mode = this.mode;
      await pIteration.forEachSeries(files, (file) => {
        this.saving = true;
        return this.$geesome.saveFile(file, {
          groupId: this.groupId, 
          folderId: this.folderId,
          async: true,
        })
          .then((contentObj) => {
            return this.contentUploaded(contentObj, mode);
          })
          .catch(() => {this.saving = false;});
      });
    },
    saveLink() {
      this.saving = true;
      this.$geesome.saveDataByUrl(this.localValue, {
        groupId: this.groupId,
        driver: this.driver,
        folderId: this.folderId,
        async: true
      })
        .then(this.contentUploaded.bind(this))
        .catch(() => {this.saving = false;})
    },
    contentUploaded(contentObj, mode?) {
      this.$emit('update:content-id', contentObj.id);
      this.$emit('uploaded', {
        method: mode || this.mode,
        id: contentObj.id
      });
      this.setMode(null);
      this.localValue = '';
      this.saving = false;
    },
    chooseUploaded() {
      this.$root.$asyncModal.open({
        id: 'choose-contents-ids-modal',
        component: ChooseContentsIdsModal,
        onClose: (selected) => {
          if (!selected) {
            return;
          }
          selected.forEach((id) => {
            this.$emit('uploaded', {
              method: 'choose-uploaded',
              id
            });
          });
        }
      });
    }
  },

  watch: {
    localValue() {
      if (this.mode === 'upload_link') {
        if (detecterLib.isYoutubeUrl(this.localValue)) {
          this.driver = 'youtubeVideo';
        }
      }
    }
  },

  computed: {
    contentsList() {
      // return _.orderBy(this.value.contents, ['position'], ['asc']);
    },
    isHideEnterText() {
      return this.hideMethods && _.includes(this.hideMethods, 'enter_text');
    },
    isHideUploadNew() {
      return this.hideMethods && _.includes(this.hideMethods, 'upload_new');
    },
    isHideUploadLink() {
      return this.hideMethods && _.includes(this.hideMethods, 'upload_link');
    },
    isHideChooseUploaded() {
      return this.hideMethods && _.includes(this.hideMethods, 'choose_uploaded');
    }
  },
  data() {
    return {
      mode: '',
      localValue: '',
      saving: false,
      driver: 'none'
    }
  },
}
