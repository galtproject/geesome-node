import { createSSRApp } from 'vue';

import createRouter from './router.js';
import asyncModal from "./components/AsyncModal/index.js";

export async function createApp(store) {
    const app = createSSRApp({
        template: `
            <div>
                <router-view></router-view>
                <async-modal ref="modal"></async-modal>
            </div>
        `,
        mounted() {
            this.$root.$modal = this.$refs.modal;
            console.log('this.$root.$modal', this.$root.$modal);
        },
    }).use(asyncModal);

    const isServer = typeof window === 'undefined';
    const router = createRouter(isServer ? null : store.defaultRoute);
    if (isServer) {
        await router.push((store.path || '/') + '?' + store.urlQuery);
    } else {
        await router.push('/');
    }
    // await router.isReady();
    app.use(router);
    app.provide('store', store);
    return {app, router, store};
}