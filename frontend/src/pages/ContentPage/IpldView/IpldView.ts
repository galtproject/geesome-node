/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const ipfsHelper = require('geesome-libs/src/ipfsHelper');

const isObject = require('lodash/isObject');

export default {
  template: require('./IpldView.template'),
  components: {},
  props: ['ipld'],
  created() {
    this.setIpldData();
  },
  methods: {
    async setIpldData() {
      console.log('setIpldData', this.ipld);
      if (isObject(this.ipld)) {
        this.ipldHash = null;
        this.ipldData = this.ipld;
      } else if (ipfsHelper.isAccountCidHash(this.ipld)) {
        this.ipldHash = await this.$geesome.resolveIpns(this.ipld);
        this.ipldData = await this.$geesome.getDbContentByStorageId(this.ipldHash);
      } else {
        this.ipldHash = this.ipld;
        this.ipldData = await this.$geesome.getDbContentByStorageId(this.ipldHash);
      }
      this.ipldKeys = [];
      this.isIpldHashByKey = {};
      if (isObject(this.ipldData)) {
        this.ipldKeys = Object.keys(this.ipldData);
      }
      console.log('ipldHash', this.ipldHash);
      console.log('ipldData', this.ipldData);
      console.log('ipldKeys', this.ipldKeys);
      this.ipldKeys.forEach((key) => {
        this.$set(this.isIpldHashByKey, key, ipfsHelper.isObjectCidHash(this.ipldData[key]));
      });
    }
  },
  watch: {
    ipld() {
      this.setIpldData();
    }
  },
  data() {
    return {
      ipldHash: null,
      ipldData: {},
      ipldKeys: [],
      isIpldHashByKey: {}
    };
  }
}
