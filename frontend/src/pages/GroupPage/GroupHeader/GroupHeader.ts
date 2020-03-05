/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
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
      console.log('this.coverImageSrc', this.coverImageSrc);
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
