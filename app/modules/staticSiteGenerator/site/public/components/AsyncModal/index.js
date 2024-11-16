/*
 * Copyright ©️ 2020 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import Modal from './Modal.js';
export {default as ModalItem} from './ModalItem.js';

export default {
    install (app, options) {
        app.component('async-modal', Modal);
    },
    // onMounted (app) {
    //     console.log('app.config.globalProperties.$modal', app.config.globalProperties.$modal);
    // }
}