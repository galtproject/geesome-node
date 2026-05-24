import { createSSRApp } from 'vue';

import createRouter from './router.js';
import asyncModal from "./components/AsyncModal/index.js";

export async function createApp(store, serverRoute = null) {
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
    await router.push(getInitialRoute(isServer, store, serverRoute));
    // await router.isReady();
    app.use(router);
    app.provide('store', store);
    return {app, router, store};
}

function getInitialRoute(isServer, store, serverRoute) {
    if (!isServer) {
        return '/';
    }
    if (serverRoute) {
        return serverRoute;
    }
    return getStoreRoute(store);
}

function getStoreRoute(store) {
    const path = store.path || '/';
    if (!store.urlQuery) {
        return path;
    }
    return `${path}?${store.urlQuery}`;
}
