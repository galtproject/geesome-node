/*
 * Copyright ©️ 2020 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {addClass, removeClass} from './utils.js';

const isPromise = promise => Object.prototype.toString.call(promise) === '[object Promise]' || promise instanceof Promise;

const DEFAULT_OPTIONS = {
    show: true,
    backdrop: true,
    destroy: true
};

const NON_TRANSITION_ERR = 'this modal item is not a Vue component, you should use `transition` component and emit `after-leave` event';

export default {
    template: `
      <div v-if="modals.length">
        <div class="modal-backdrop" v-if="currModal && currModal.options.backdrop"></div>
        <component v-for="{id, component, props, options} of modals" :is="component" :key="id" ref="modal" v-bind="props" v-show="options.show" @click.native="e => handleBackdrop(e, id, options.backdrop)"></component>
      </div>
    `,
    data() {
        return {
            modals: [],
            currModal: null
        }
    },
    computed: {
        currModalId() {
            return this.currModal && this.currModal.id
        }
    },
    watch: {
        currModal: function(modal) {
            setTimeout(() => {
                if(modal){
                    addClass(document.body, 'modal-open');
                } else if(!document.querySelector(".modal[role=dialog]")){
                    removeClass(document.body, 'modal-open');
                }
            }, 500);
        }
    },
    methods: {
        close(modalId, data) {
            modalId = modalId || this.currModalId

            let modal

            if (!modalId || !(modal = this.getModal(modalId))) return Promise.resolve()

            const {options} = modal

            options.show = false

            const modalItem = this.getModalItem(modalId)

            if (!modalItem) return Promise.reject(new TypeError(NON_TRANSITION_ERR))

            const callback = resolve => {
                options.destroy ? this.removeModal(modalId) : this.resetCurrModal(modalId)
                resolve();
                if(modal.onClose)
                    modal.onClose(data);
            };

            return new Promise(resolve => {
                if(getComputedStyle(modalItem.$el).display === 'none' || !modalItem.$once) {
                    callback(resolve)
                } else {
                    modalItem.$once('after-leave', () => callback(resolve))
                }
            })
        },
        closeAll(destroy = true, immediate) {
            let promise = Promise.resolve()

            destroy && immediate ? (this.modals = []) : this.modals.forEach(modal => { promise = promise.then(() => this.close(modal.id, destroy)) })

            return promise
        },
        open(modal) {
            modal.id = modal.id || Date.now()
            return isPromise(modal.component) ? modal.component.then(component => this.resolve(Object.assign(modal, {component}))) : this.resolve(modal)
        },
        resolve(modal) {
            const {id, component, props, options} = modal

            const m = this.getModal(id)

            if (m) {
                component && (m.component = component)
                modal = m
            } else if (!component) {
                return Promise.reject(new ReferenceError('no component passed on initialization'))
            }

            modal.props = {...props}

            const opts = {...DEFAULT_OPTIONS, ...options}

            if (!opts.show) {
                modal.options = opts
                return Promise.resolve()
            }

            const promise = this.currModalId === id ? Promise.resolve() : this.close()

            return promise.then(() => {
                modal.options = opts
                m || this.modals.push(modal)
                this.currModal = modal

                return new Promise((resolve, reject) => this.$nextTick(() => {
                    resolve(modal);
                }))
            })
        },
        getModal(modalId) {
            return this.modals.find(m => m.id === modalId)
        },
        getModalIndex(modalId) {
            return this.modals.findIndex(m => m.id === modalId)
        },
        getModalRef(modalId) {
            return this.$refs.modal[this.getModalIndex(modalId)]
        },
        getModalItem(modalId) {
            return this.getModalRef(modalId)
        },
        resetCurrModal(modalId) {
            modalId === this.currModalId && (this.currModal = null)
        },
        removeModal(modalId) {
            const modalIndex = this.getModalIndex(modalId)
            modalIndex + 1 && this.modals.splice(modalIndex, 1)
            this.resetCurrModal(modalId)
        },
        handleBackdrop(e, id, backdrop) {
            if (e.target !== e.currentTarget || backdrop === 'static')
                return;

            const modal = this.getModal(id);
            if(!modal.options.closeOnBackdrop)
                return;

            this.close(id)
        }
    }
}
