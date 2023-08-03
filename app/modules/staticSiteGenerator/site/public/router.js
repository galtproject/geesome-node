import {
    createRouter,
    createMemoryHistory,
    createWebHistory,
} from 'vue-router';

const isServer = typeof window === 'undefined';

let history = isServer ? createMemoryHistory() : createWebHistory();

const routes = [
    {
        path: '',
        component: () => import('./pages/BaseList/index.js'),
    },
    { path: '/page/:page', name: 'page', component: () => import('./pages/BaseList/index.js'), props: true },
    { path: '/post/:postId', name: 'post', component: () => import('./pages/Post/index.js'), props: true },
];

export default function () {
    return createRouter({ routes, history });
}