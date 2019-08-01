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

import {
  EventBus
} from "../../../../services/events";

import {
  EVENT_SHOW_MOVE_FILE_CONTAINER,
  EVENT_HIDE_MOVE_FILE_CONTAINER,
  EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER,
  EVENT_UPDATE_VALUE_MOVE_FILE_CONTAINER,
  EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER, EVENT_COMPLETE_MOVE_FILE_CONTAINER
} from "../events";

export default {
  // name: 'autocomplete-container',
  template: require('./MoveFileCatalogItemContainer.html'),
  props: [],
  mounted() {
    this.$refs.container.addEventListener('click', () => {
      EventBus.$emit(EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
    });

    EventBus.$on(EVENT_SHOW_MOVE_FILE_CONTAINER, (config) => {
      this.uniqId = config.uniqId;

      this.showList = true;
      this.itemToMove = config.itemToMove;

      let inputOffset = this.getElOffset(config.input);
      this.top = (inputOffset.top + this.getElHeight(config.input)) - 20 + 'px';
      this.left = inputOffset.left + 'px';

      const drawer = document.querySelectorAll('.md-app-drawer');
      if (drawer && drawer.length) {
        this.left = (inputOffset.left - this.getElWidth(drawer[0])) + 'px';
      }

      this.getItems();

      // this.width = this.getElWidth(config.input) + 'px';
    });

    EventBus.$on(EVENT_HIDE_MOVE_FILE_CONTAINER, (config) => {
      if (this.uniqId != config.uniqId) {
        return;
      }
      this.uniqId = null;
      this.showList = false;
      this.$emit('change');
    });

    EventBus.$on(EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER, (config) => {
      if (this.uniqId != config.uniqId) {
        return;
      }
      this.items = config.items;
    });
  },
  methods: {
    async getItems() {
      const fileCatalog = await this.$coreApi.getFileCatalogItems(undefined, 'folder', {search: this.search ? '%' + this.search + '%' : ''});
      this.items = fileCatalog.list;
    },
    getElOffset(el) {
      const rect = el.getBoundingClientRect();
      const docEl = document.documentElement;

      const top = rect.top + window.pageYOffset - docEl.clientTop;
      const left = rect.left + window.pageXOffset - docEl.clientLeft;
      return {top, left};
    },
    getElHeight(el) {
      return el.offsetHeight;
    },
    getElWidth(el) {
      return el.offsetWidth;
    },
    preventClose() {
      EventBus.$emit(EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
    },
    async selectItem(folder) {
      await this.$coreApi.updateFileCatalogItem(this.itemToMove.id, {parentItemId: folder.id});
      EventBus.$emit(EVENT_HIDE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
      EventBus.$emit(EVENT_COMPLETE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
      this.$notify({
        type: 'success',
        title: "Success"
      })
    }
  },
  watch: {
    search() {
      this.getItems();
    }
  },
  computed: {},
  data: function () {
    return {
      showList: false,
      items: [],
      top: '0px',
      left: '0px',
      // width: '0px',
      uniqId: null,
      itemToMove: null,
      search: ''
    }
  }
}
