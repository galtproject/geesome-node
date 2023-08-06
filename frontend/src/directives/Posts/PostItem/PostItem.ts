/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ImageModal from "../../../modals/ImageModal/ImageModal";
import CybLinkKeywordsModal from "../../../modals/CybLinkKeywordsModal/CybLinkKeywordsModal";

const _ = require('lodash');
const moment = require('moment');

export default {
  template: require('./PostItem.template'),
  props: ['value', 'group'],
  async created() {
    this.getGroup();
  },

  async mounted() {

  },

  methods: {
    async getGroup() {
      if (this.group) {
        this.localGroup = this.group;
        return;
      }
      if (!this.value.groupId) {
        this.localGroup = null;
        return;
      }
      this.localGroup = await this.$geesome.getGroup(this.value.groupId);
    },
    link() {
      this.$root.$asyncModal.open({
        id: 'cyb-link-keywords-modal',
        component: CybLinkKeywordsModal,
        props: {'contentHash': this.value.manifestId},
        options: {closeOnBackdrop: true}
      });
      // const event = document.createEvent('Event');
      // event.initEvent('cyb:link');
      // document.dispatchEvent(event);
      // console.log('dispatchEvent', event);
    }
  },

  watch: {
    'value.group'() {
      this.getGroup();
    }
  },

  computed: {
    contentsList() {
      return _.orderBy(this.value.contents, ['position'], ['asc']);
    },
    date() {
      return moment(this.value.publishedAt * 1000).format('DD.MM.YYYY h:mm:ss');
    },
    cybActive() {
      return this.$store.state.cybActive;
    },
  },
  data() {
    return {
      localGroup: null,
      content: ''
    }
  },
}
