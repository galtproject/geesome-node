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
    name: 'main-menu',
    template: require('./MainMenu.html'),
    components: {  },
    props: ['menuVisible', 'menuMinimized'],
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
            this.menuVisibleLocal = !this.menuVisibleLocal;
            if(!this.menuVisibleLocal) {
                setTimeout(() => {
                    this.menuMinimizedLocal = true;
                }, 200)
            } else {
                this.menuMinimizedLocal = false;
            }
        }
    },

    watch: {
        menuVisibleLocal() {
            this.$emit('update:menu-visible', this.menuVisibleLocal);
        },
        menuMinimizedLocal() {
            this.$emit('update:menu-minimized', this.menuMinimizedLocal);
        }
    },

    computed: {
        serverAddress() {
            return this.$store.state.serverAddress;
        }
    },
    data() {
        return {
            localeKey: 'app_container.main_menu',
            menuVisibleLocal: false,
            menuMinimizedLocal: true,
            memberInGroups: [],
            adminInGroups: []
        }
    },
}