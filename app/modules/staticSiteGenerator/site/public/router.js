import {
    createRouter,
    createMemoryHistory,
    createWebHashHistory,
} from 'vue-router';

const isServer = typeof window === 'undefined';

let history = isServer ? createMemoryHistory() : createWebHashHistory();

let routes = [
    {
        path: '',
        component: () => import('./pages/BaseList/index.js'),
    },
    { path: '/page/:page', name: 'page', component: () => import('./pages/BaseList/index.js'), props: true },
    { path: '/post/:postId', name: 'post', component: () => import('./pages/Post/index.js'), props: true },
    { path: '/content-list', name: 'content-list', component: () => import('./pages/ContentList/index.js'), props: true },
];

export default function (defaultRoute = null) {
    if (defaultRoute) {
        routes = routes.filter((r) => r.name === defaultRoute);
        routes[0].path = '';
    }
    return createRouter({ routes, history });
}