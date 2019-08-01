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
  EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER
} from "../events";

export default {
    // name: 'autocomplete-container',
    template: require('./MoveFileCatalogItemContainer.html'),
    props: [],
    mounted(){
        this.$refs.container.addEventListener('click', () => {
            EventBus.$emit(EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER, {uniqId: this.uniqId});
        });
        
        EventBus.$on(EVENT_SHOW_MOVE_FILE_CONTAINER,(config) => {
            this.uniqId = config.uniqId;

            this.showList = true;
            this.items = config.items;
            this.value = config.value;

            let inputOffset = this.getElOffset(config.input);
            this.top = (inputOffset.top + this.getElHeight(config.input)) - 20 + 'px';
            this.left = inputOffset.left + 'px';
            
            const drawer = document.querySelectorAll('.md-app-drawer');
            if(drawer && drawer.length) {
                this.left = (inputOffset.left - this.getElWidth(drawer[0])) + 'px';
            }
            
            // this.width = this.getElWidth(config.input) + 'px';
        });

        EventBus.$on(EVENT_HIDE_MOVE_FILE_CONTAINER,(config) => {
            if(this.uniqId != config.uniqId) {
                return;
            }
            this.uniqId = null;
            this.showList = false;
        });

        EventBus.$on(EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER,(config) => {
            if(this.uniqId != config.uniqId) {
                return;
            }
            this.items = config.items;
        });
    },
    methods: {
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
        selectItem(item) {
            EventBus.$emit(EVENT_UPDATE_VALUE_MOVE_FILE_CONTAINER, {value: item.value, title: item.title, uniqId: this.uniqId});
            this.showList = false;
        }
    },
    watch: {
        
    },
    computed: {
        
    },
    data: function () {
        return {
            showList: false,
            items: [],
            selected: [],
            top: '0px',
            left: '0px',
            // width: '0px',
            uniqId: null
        }
    }
}
