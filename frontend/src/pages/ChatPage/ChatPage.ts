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

import GroupItem from "./GroupItem/GroupItem";

export default {
    name: 'chat-page',
    template: require('./ChatPage.html'),
    components: { GroupItem },
    created() {
        
    },
    mounted() {
        
    },
    methods: {
        selectGroup(index) {
            this.selectedGroupIndex = index;
        },
        getLocale(key, options?) {
            return this.$locale.get(this.localeKey + "." + key, options);
        }
    },
    data() {
        return {
            localeKey: 'chat_page',
            loading: true,
            selectedGroupIndex: -1,
            groups: [
                {avatar: 'https://placeimg.com/100/100/people/7', name: 'Eva summer', address: '0xdc802fa26a41b848812e00da5043f7dcd7eea400', lastMessage: {text: 'Sed ut perspiciatis unde...', date: '11:00'}},
                {avatar: 'https://placeimg.com/100/100/people/4', name: 'Alexandra Smith', address: '0xd7877afc0b8c52abed659566ecaa4afda05e9f7a', lastMessage: {text: 'This is amazing!', date: '10:00'}},
                {avatar: 'https://placeimg.com/100/100/people/6', name: 'Mike Apple', address: '0xd7877afc0b8c52abed659566ecaa4afda05e9f7a', lastMessage: {text: '😁 <span class="highlight">Sticker</span>', date: '9:00'}},
                {avatar: 'https://placeimg.com/100/100/people/3', name: 'Evening club', address: '0xdc802fa26a41b848812e00da5043f7dcd7eea400', lastMessage: {text: '<span class="highlight">Eva: Photo</span>', date: '8:00'}},
            ]
        };
    },
    computed: {
        user_wallet() {
            return this.$store.state.user_wallet
        }
    },
}
