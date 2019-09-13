/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default {
  template: require('./GroupHeader.html'),
  props: ['group'],
  async created() {
    this.fetchData();
  },

  async mounted() {

  },

  methods: {
    async fetchData() {
      this.coverImageSrc = await this.$coreApi.getContentLink(this.group.coverImage);
    }
  },

  watch: {
    group() {
      this.fetchData();
    }
  },

  computed: {},
  data() {
    return {
      coverImageSrc: null
    }
  },
}
