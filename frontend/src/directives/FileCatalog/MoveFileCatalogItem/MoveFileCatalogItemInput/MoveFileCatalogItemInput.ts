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

const _ = require('lodash');
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
    // name: 'autocomplete-input',
    template: require('./MoveFileCatalogItemInput.html'),
    props: ['value', 'placeholder', 'disabled', 'emptyLabel', 'items'],
    async created() {
        this.uniqId = Math.random().toString(36).substr(2, 9);
        
        this.searchText = _.isUndefined(this.value) ?  '' : this.value;
        
        this.updateValueDebounce = _.debounce((value) => {
            this.$emit('input', value);
            this.$emit('change', value);
        }, 100);

        EventBus.$on(EVENT_UPDATE_VALUE_MOVE_FILE_CONTAINER, (data) => {
            if(this.uniqId != data.uniqId)
                return;
            this.showList = false;
            this.$emit('selected', data.value);
            this.searchText = data.title;
            this.updateValue(data.value);
        });

        EventBus.$on(EVENT_PREVENT_CLOSE_MOVE_FILE_CONTAINER, (data) => {
            if(this.uniqId != data.uniqId)
                return;
            this.preventClose();
        });
        
        this.filterItems();
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
        openContainer(){
            if(this.showList)
                return;

            EventBus.$emit(EVENT_SHOW_MOVE_FILE_CONTAINER, {
                uniqId: this.uniqId,
                input: this.$refs.input,
                items: this.items
            });
            
            this.showList = true;
        },
        onClickOutside(){
            setTimeout(() => {
                if(this.isPreventClose) {
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
        },
        itemSearch(item) {
            return _.includes(item.title.toLowerCase(), this.searchText.toLowerCase());
        },
        filterItems() {
            if(!this.searchText) {
                this.filtredItems = this.items;

                EventBus.$emit(EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER, {
                    uniqId: this.uniqId,
                    items: this.filtredItems
                });
                return;
            }
            this.filtredItems = this.items.filter((item) => {
                return this.itemSearch(item) || (item.items && item.items.filter((subItem) => this.itemSearch(subItem)).length)
            }).map(item => {
                if(this.itemSearch(item)) {
                    return item;
                }
                item = _.clone(item);
                item.items = item.items.filter((subItem) => this.itemSearch(subItem));
                return item;
            });
            EventBus.$emit(EVENT_UPDATE_ITEMS_MOVE_FILE_CONTAINER, {
                uniqId: this.uniqId,
                items: this.filtredItems
            });
        },
        updateValue(value) {
            this.updateValueDebounce(value);
        }
    },
    watch: {
        searchText() {
            this.filterItems();
        }
    },
    computed: {
        
    },
    data() {
        return {
            searchText: "",
            filtredItems: []
        }
    }
}
