/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import ContentManifestInfoItem from "../../directives/ContentManifestInfoItem/ContentManifestInfoItem";
import Helper from "geesome-vue-components/src/services/helper";
import GroupItem from "../GroupsList/GroupItem/GroupItem";
import PostItem from "../../directives/Posts/PostItem/PostItem";
import IpldView from "./IpldView/IpldView";

const ipfsHelper = require('geesome-libs/src/ipfsHelper');

const includes = require('lodash/includes');
const clone = require('lodash/clone');

export default {
  template: require('./ContentPage.template'),
  components: {ContentManifestInfoItem, GroupItem, PostItem, IpldView},
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
      this.contentType = 'image';
      this.subManifests = [];
      try {
        if (ipfsHelper.isAccountCidHash(manifestId)) {
          manifestId = await this.$geesome.resolveIpns(manifestId);
        }

        if (!manifestId) {
          const objectDb = await this.$geesome.getDbContentByStorageId(this.manifestId);
          manifestId = objectDb.manifestStorageId;
        }

        if (manifestId) {
          this.manifest = await this.$geesome.getObject(manifestId);
        }
        console.log('this.manifest', this.manifest);

        if (this.manifest && this.manifest._entityName) {
          this.type = this.manifest._entityName;
          if (this.type === 'group') {
            await this.$geesome.fetchIpldFields(this.manifest, ['avatarImage', 'coverImage']);
            await this.$geesome.getGroupPostsAsync(manifestId, (posts) => {
              this.subManifests = clone(posts);
            }, (posts) => {
              this.subManifests = clone(posts);
              console.log('posts', posts);
              this.loading = false;
            })
          }
          if (this.type === 'post') {
            this.manifest.group = await this.$geesome.getGroup(this.manifest.groupStaticId);
          }
        } else {
          this.type = 'unknown';
        }

        if(!includes(['post','content', 'group'], this.type)) {
          this.type = 'unknown';
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
      return Helper.humanizeKey(this.type);
    }
  },
  data() {
    return {
      localeKey: 'content_page',
      inputManifestId: '',
      contentType: null,
      contentExtension: null,
      manifest: null,
      subManifests: [],
      type: '',
      loading: false
    };
  }
}
