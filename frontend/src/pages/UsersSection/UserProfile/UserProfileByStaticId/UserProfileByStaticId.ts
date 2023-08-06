/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import UserProfile from "../UserProfile";

export default {
  template: require('./UserProfileByStaticId.template'),
  components: {UserProfile},
  props: [],
  async created() {
    
  },
  async mounted() {
    const itemsData = await this.$geesome.getAllItems('users', this.$route.params.staticId);
    this.user = itemsData.list[0];
  },
  methods: {
    
  },
  watch: {},
  computed: {

  },
  data() {
    return {
      user: null
    };
  }
}
