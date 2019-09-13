/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const _ = require('lodash');
import {
  EventBus
} from "../../../../services/events";

import {
  EVENT_SHOW_MOVE_FILE_CONTAINER,
  EVENT_HIDE_MOVE_FILE_CONTAINER,
  EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER,
  EVENT_UPDATE_VALUE_MOVE_FILE_CONTAINER, EVENT_COMPLETE_MOVE_FILE_CONTAINER
} from "../events";

export default {
  // name: 'autocomplete-input',
  template: require('./MoveFileCatalogItemInput.html'),
  props: ['item', 'placeholder', 'disabled', 'emptyLabel'],
  async created() {
    this.uniqId = Math.random().toString(36).substr(2, 9);

    EventBus.$on(EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER, (data) => {
      if (this.uniqId != data.uniqId)
        return;
      this.preventClose();
    });

    EventBus.$on(EVENT_COMPLETE_MOVE_FILE_CONTAINER, (data) => {
      if (this.uniqId != data.uniqId)
        return;
      this.$emit('moved');
    });
  },
  mounted() {
    this.clickOutsideListener = () => {
      this.onClickOutside();
    };
    document.body.addEventListener('click', this.clickOutsideListener);

    this.preventCloseListener = () => {
      this.preventClose();
    };
    this.$refs.input.querySelectorAll('button')[0].addEventListener('click', this.preventCloseListener)
  },
  beforeDestroy() {
    document.removeEventListener('click', this.clickOutsideListener);

    this.$refs.input.querySelectorAll('button')[0].removeEventListener('click', this.preventCloseListener);
  },
  methods: {
    openContainer() {
      if (this.showList)
        return;

      EventBus.$emit(EVENT_SHOW_MOVE_FILE_CONTAINER, {
        uniqId: this.uniqId,
        input: this.$refs.input,
        itemToMove: this.item
      });

      this.showList = true;
    },
    onClickOutside() {
      setTimeout(() => {
        if (this.isPreventClose) {
          return;
        }
        this.showList = false;
        EventBus.$emit(EVENT_HIDE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
      }, 200);
    },
    preventClose() {
      this.isPreventClose = true;
      setTimeout(() => {
        this.isPreventClose = false;
      }, 300);
    }
  },
  watch: {},
  computed: {},
  data() {
    return {
      
    }
  }
}
