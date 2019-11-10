/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";
import EthData from "@galtproject/frontend-core/libs/EthData";
import GroupItem from "../GroupsList/GroupItem/GroupItem";
import PostItem from "../../directives/Posts/PostItem/PostItem";

const ipfsHelper = require('@galtproject/geesome-libs/src/ipfsHelper');

const _ = require('lodash');

export default {
  template: require('./ContentPage.html'),
  components: {ContentManifestInfoItem, GroupItem, PostItem},
  props: [],
  created() {
    this.inputManifestId = this.manifestId;
    this.type = this.$route.query.type || 'content';
    if (this.manifestId) {
      this.getManifest();
    }
  },
  methods: {
    setManifestIdRoute() {
      this.$router.push({params: {manifestId: this.inputManifestId}});
    },
    async getManifest() {
      this.loading = true;
      let manifestId = this.manifestId;
      this.manifest = null;
      this.subManifests = [];
      try {
        if (ipfsHelper.isIpfsHash(manifestId)) {
          manifestId = await this.$coreApi.resolveIpns(manifestId);
        }
        this.manifest = await this.$coreApi.getObject(manifestId);
        this.type = this.manifest._type.split('-')[0];
        if (this.type === 'group') {
          await this.$coreApi.fetchIpldFields(this.manifest, ['avatarImage', 'coverImage']);
          await this.$coreApi.getGroupPostsAsync(manifestId, (posts) => {
            this.subManifests = _.clone(posts);
          }, (posts) => {
            this.subManifests = _.clone(posts);
            console.log('posts', posts);
            this.loading = false;
          })
        }
        if (this.type === 'post') {
          this.manifest.group = await this.$coreApi.getGroup(this.manifest.groupStaticId);
        }
      } catch (e) {

      }
      this.loading = false;
    }
  },
  watch: {
    async manifestId() {
      this.inputManifestId = this.manifestId;
      this.getManifest();
    }
  },
  computed: {
    manifestId() {
      return this.$route.params.manifestId;
    },
    humanReadableType() {
      return EthData.humanizeKey(this.type);
    }
  },
  data() {
    return {
      localeKey: 'content_page',
      inputManifestId: '',
      manifest: null,
      subManifests: [],
      type: '',
      loading: false
    };
  }
}
