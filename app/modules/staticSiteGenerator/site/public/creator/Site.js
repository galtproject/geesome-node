export default {
    inject: ['store'],
    template: `<CreatorApp :initial-state="store.creator" />`
};
