import { createSSRApp } from 'vue';

import createRouter from './router.js';
import asyncModal from "./components/AsyncModal/index.js";

export async function createApp(store, serverRoute = null, creatorApp = null) {
    const app = createSSRApp({
        template: `
            <div>
                <router-view></router-view>
                <async-modal ref="modal"></async-modal>
            </div>
        `,
        mounted() {
            this.$root.$modal = this.$refs.modal;
        },
    }).use(asyncModal);
    if (creatorApp) {
        app.component('CreatorApp', creatorApp);
    }
    app.config.compilerOptions.comments = false;

    const isServer = typeof window === 'undefined';
    const initialRoute = getInitialRoute(isServer, store, serverRoute);
    const router = createRouter(isServer ? null : store.defaultRoute);
    await router.push(initialRoute);
    // await router.isReady();
    app.use(router);
    app.provide('store', store);
    return {app, router, store};
}

function getInitialRoute(isServer, store, serverRoute) {
    if (!isServer) {
        return window.location.hash.slice(1) || (store.defaultRoute ? '/' : getStoreRoute(store));
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
