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
export default {
    name: 'pretty-name',
    template: require('./PrettyName.html'),
    props: ['name'],
    created() {

    },
    watch: {
        
    },
    methods: {
        
    },
    computed: {
        prettyName() {
            if(!this.name) {
                return '';
            }
            const dotIndex = _.lastIndexOf(this.name, '.');
            let cutContentLength = 10;
            let endChars = 4;
            if(dotIndex <= cutContentLength) {
                return this.name;
            }
            if(this.name.length < cutContentLength + endChars) {
                cutContentLength = cutContentLength - endChars;
            }
            return this.name.slice(0, cutContentLength) + "..." + this.name.slice(dotIndex - endChars);
        }
    },
    data() {
        return {
            
        }
    }
}
