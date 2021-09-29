/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');
export default {
  name: 'pretty-name',
  template: require('./PrettyName.template'),
  props: ['name'],
  created() {

  },
  watch: {},
  methods: {},
  computed: {
    prettyName() {
      if (!this.name) {
        return '';
      }
      const dotIndex = _.lastIndexOf(this.name, '.');
      let cutContentLength = 10;
      let endChars = 4;
      if (dotIndex <= cutContentLength) {
        return this.name;
      }
      if (this.name.length < cutContentLength + endChars) {
        cutContentLength = cutContentLength - endChars;
      }
      return this.name.slice(0, cutContentLength) + "..." + this.name.slice(dotIndex - endChars);
    }
  },
  data() {
    return {}
  }
}
