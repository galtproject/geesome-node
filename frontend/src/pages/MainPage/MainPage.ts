/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import CreatedForAdminOverview from "./Widgets/CreatedForAdminOverview/CreatedForAdminOverview";
import WelcomeToGeesome from "./Widgets/WelcomeToGeesome/WelcomeToGeesome";

export default {
  template: require('./MainPage.template'),
  components: {CreatedForAdminOverview, WelcomeToGeesome},
  methods: {},
  data() {
    return {
      localeKey: 'main_page'
    };
  },
  computed: {}
}
