const { path } = require('@vuepress/utils')

module.exports = {
    name: 'blog',
    layouts: {
        // Layout: path.resolve(__dirname, 'Layout.vue'),
        BaseList: path.resolve(__dirname, 'BaseList.vue'),
        Post: path.resolve(__dirname, 'Post.vue'),
        404: path.resolve(__dirname, '404.vue'),
    },
    // ...
};