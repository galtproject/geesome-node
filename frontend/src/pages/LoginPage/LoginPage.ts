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
    template: require('./LoginPage.html'),
    methods: {
        login() {
            this.$coreApi.login(this.username, this.password).then((data) => {
                this.$store.commit('user', data.user);
                this.$router.push({name: 'main-page'});
                this.error = null;
            }).catch(() => {
                this.error = 'failed';
            })
        }
    },
    data() {
        return {
            localeKey: 'login_page',
            username: null,
            password: null,
            error: null
        };
    },
    computed: {
        
    }
}
