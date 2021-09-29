/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ChooseFileContentsIdsModal from "../../../../modals/ChooseFileContentsIdsModal/ChooseFileContentsIdsModal";
import ContentManifestItem from "../../../../directives/ContentManifestItem/ContentManifestItem";

export default {
  name: 'profile-form',
  template: require('./ProfileForm.template'),
  components: {ContentManifestItem},
  props: ['user', 'invalid'],
  methods: {
    chooseImage(fieldName) {
      this.$root.$asyncModal.open({
        id: 'choose-file-contents-ids-modal',
        component: ChooseFileContentsIdsModal,
        onClose: (selected) => {
          if (!selected || !selected.length) {
            return;
          }
          this.user[fieldName] = selected[0];
        }
      });
    },
    updateInvalid() {
      const invalid = !this.user.name;
      this.$emit('update:invalid', invalid);
    }
  },
  watch: {
    'user.name'() {
      this.updateInvalid();
    },
    // 'user.title'() {
    //   this.updateInvalid();
    // }
  },
  data() {
    return {
      localeKey: 'user_form'
    };
  }
}
