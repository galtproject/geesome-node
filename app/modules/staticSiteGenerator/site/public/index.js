import { createSSRApp } from 'vue';

import createRouter from './router.js';

export async function createApp(store) {
    const app = createSSRApp({ template: '<router-view></router-view>' });
    const router = createRouter();

    const isServer = typeof window === 'undefined';
    if (isServer) {
        await router.push((store.path || '/') + '?' + store.urlQuery);
    } else {
        let query = window.location.search;
        query
            .replace('?', '')
            .split('&')
            .some(queryItem => {
                if (queryItem.indexOf('tgWebAppStartParam') === 0) {
                    const tgParam = queryItem.split('=')[1] || '';
                    query += '&' + tgParam.split('-')[0] + '=' + tgParam.split('-')[1];
                    return true;
                }
            });

        await router.push(window.location.pathname + query);
    }
    app.use(router);
    app.provide('store', store);
    return {app, router};
}