/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import GeesomeNodeServerModal from "../../../../modals/GeesomeNodeServerModal/GeesomeNodeServerModal";

export default {
  template: require('./WelcomeToGeesome.template'),
  components: {},
  props: [],
  async created() {

  },
  methods: {
    connectToNode() {
      this.$root.$asyncModal.open({
        id: 'geesome-node-server-modal',
        component: GeesomeNodeServerModal
      });
    }
  },
  watch: {},
  computed: {
    user() {
      return this.$store.state.user;
    }
  },
  data() {
    return {
      localeKey: 'widgets.welcome_to_geesome',
    };
  }
}
