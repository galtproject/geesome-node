const {createBuildApp} = require('@vuepress/core');
const { path } = require('@vuepress/utils');
const plugin = require('./plugin');
const {apiRequest} = require('./helpers');

module.exports = async (config) => {
    async function storeFolder(dirPath) {
        return apiRequest(config.port, 'user/save-directory', config.token, {path: dirPath, groupId: config.groupId}).then(c => c.storageId);
    }

    console.log('createBuildApp');
    const staticSiteApp = createBuildApp({
        base: config.base,
        source: __dirname,
        theme: path.resolve(__dirname, './theme'),
        templateBuild: path.resolve(__dirname, './theme/index.ssr.html'),
        plugins: [plugin(config.posts, config.options)],
        bundler: '@galtproject/vite',
        bundlerConfig: {
            baseStorageUri: config.bundlerConfig.baseStorageUri,
            storeFolder,
        },
    });

    // initialize and prepare
    console.log('staticSiteApp.init');
    await staticSiteApp.init();
    console.log('staticSiteApp.prepare');
    await staticSiteApp.prepare();

    // build
    // TODO: update percent on build process
    console.log('staticSiteApp.build');
    await staticSiteApp.build();

    // process onGenerated hook
    console.log('staticSiteApp.pluginApi.hooks.onGenerated.process');
    await staticSiteApp.pluginApi.hooks.onGenerated.process(staticSiteApp);
};