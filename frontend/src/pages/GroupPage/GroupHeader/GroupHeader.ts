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
      this.coverImageSrc = await this.$coreApi.getImageLink(this.group.coverImage);
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
