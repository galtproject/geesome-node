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

export default {
    template: require('./MainMenu.html'),
    components: {  },
    async created() {
        this.memberInGroups = await this.$serverApi.getMemberInGroups();
        this.adminInGroups = await this.$serverApi.getAdminInGroups();
    },

    async mounted() {
        
    },

    methods: {
        getLocale(key, options?) {
            return this.$locale.get(this.localeKey + "." + key, options);
        },
        toggleMenu () {
            this.menuVisible = !this.menuVisible;
            if(!this.menuVisible) {
                setTimeout(() => {
                    this.menuMinimized = true;
                }, 200)
            } else {
                this.menuMinimized = false;
            }
        }
    },

    watch: {

    },

    computed: {
        serverAddress() {
            return this.$store.state.serverAddress;
        }
    },
    data() {
        return {
            localeKey: 'app_container.main_menu',
            menuVisible: false,
            menuMinimized: true,
            memberInGroups: [],
            adminInGroups: []
        }
    },
}
