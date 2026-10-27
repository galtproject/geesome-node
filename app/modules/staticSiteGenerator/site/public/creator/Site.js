import {App} from './app.ts';
export default {
    components: {App}, inject: ['store'],
    template: `<App :initial-state="store.creator" />`
};
