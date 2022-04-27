import {IGeesomeApp} from "../../../interface";
import {ContentMimeType, IContent} from "../database/interface";

const {createBuildApp} = require('@vuepress/core');
const { path } = require('@vuepress/utils');

const base = '/';
const plugin = require('./plugin');
const pIteration = require('p-iteration');
const _ = require('lodash');
const {rmDir} = require('./helpers');
const commonHelper = require('geesome-libs/src/common');

module.exports = (app: IGeesomeApp) => {
    const module = getModule(app);
    require('./api')(app, module);
    return module;
}

function getModule(app: IGeesomeApp) {
    app.checkModules(['asyncOperation', 'group']);

    class StaticSiteGenerator {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId, apiKey, type, id, options) {
            if (type === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, id);
                if (!isAdmin) {
                    throw Error('not_enough_rights');
                }
            } else {
                throw Error('unknown_type');
            }

            const apiKeyId = await app.getApyKeyId(apiKey);
            console.log('apiKeyId', apiKeyId);
            await app.ms.asyncOperation.addUserOperationQueue(userId, this.moduleName, apiKeyId, {
                type,
                id,
                options
            });
            return this.processQueue();
        }

        async processQueue() {
            const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(this.moduleName);
            if (!waitingQueue) {
                return;
            }

            console.log('!!waitingQueue.asyncOperation', !!waitingQueue.asyncOperation);
            if (waitingQueue.asyncOperation) {
                if (waitingQueue.asyncOperation.inProcess) {
                    console.log('return');
                    return;
                } else {
                    console.log('closeUserOperationQueueByAsyncOperationId', waitingQueue.asyncOperation.id);
                    await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(waitingQueue.asyncOperation.id);
                    return this.processQueue();
                }
            }

            const {userId, userApiKeyId} = waitingQueue;
            const {type, id, options} = JSON.parse(waitingQueue.inputJson);

            const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
                userApiKeyId,
                name: 'run-' + this.moduleName,
                channel: 'type:' + type + ';id:' + id + ';op:' + await commonHelper.random()
            });

            await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

            // run in background
            this.generateContent(type, id, {
                ...options,
                userId,
                userApiKeyId,
                asyncOperationId: asyncOperation.id
            }).then(async (content: IContent) => {
                await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id, content.id);
                if (type === 'group') {
                    const group = await app.ms.group.getGroup(id);
                    const properties = group.propertiesJson ? JSON.parse(group.propertiesJson) : {};
                    properties.staticSiteManifestStorageId = content.manifestStorageId;
                    await app.ms.group.updateGroup(userId, id, {propertiesJson: JSON.stringify(properties)});
                }
            });

            return app.ms.asyncOperation.getUserOperationQueue(waitingQueue.userId, waitingQueue.id);
        }

        async getDefaultOptionsByGroupId(groupId) {
            return this.getDefaultOptions(await app.ms.group.getGroup(groupId));
        }

        getDefaultOptions(group, baseStorageUri = null) {
            baseStorageUri = baseStorageUri || 'http://localhost:7711/v1/content-data/';
            return {
                baseStorageUri,
                lang: 'en',
                dateFormat: 'DD.MM.YYYY hh:mm:ss',
                post: {
                    titleLength: 200,
                    descriptionLength: 200,
                },
                postList: {
                    postsPerPage: 10,
                },
                site: {
                    title: group.title,
                    username: group.name,
                    description: group.description,
                    avatarUrl: group.avatarImage ? baseStorageUri + group.avatarImage.storageId : null,
                    postsCount: group.publishedPostsCount,
                    base
                }
            }
        }

        getOptionValue(group, options, name) {
            const resultOptions = this.getResultOptions(group, options.baseStorageUri);
            return _.get(resultOptions, name);
        }

        getResultOptions(group, options) {
            options = _.clone(options) || {};
            const defaultOptions = this.getDefaultOptions(group, options.baseStorageUri);
            const merged = _.merge(defaultOptions, options);
            ['post.titleLength', 'post.descriptionLength', 'postList.postsPerPage'].forEach(name => {
                merged[name] = parseInt(merged[name]);
            });
            return merged;
        }

        async generateContent(name, data, options: any = {}): Promise<IContent> {
            const distPath = path.resolve(__dirname, './.vuepress/dist');
            rmDir(distPath);

            const group = await app.ms.group.getGroup(data);
            let properties = {};
            try {
                if (group.propertiesJson) {
                    properties = JSON.parse(group.propertiesJson);
                }
            } catch (e) {
            }
            options = this.getResultOptions(group, _.merge(properties, options));

            console.log('getGroupPosts', data);
            const {list: groupPosts} = await app.ms.group.getGroupPosts(data, {}, {
                sortBy: 'publishedAt',
                sortDir: 'desc',
                limit: 9999,
                offset: 0
            });
            console.log('groupPosts.length', groupPosts.length);
            const {baseStorageUri} = options;

            const posts = await pIteration.mapSeries(groupPosts, async (gp, i) => {
                const {text: content, images, videos} = await app.ms.group.getPostContent(baseStorageUri, gp);

                if (options.asyncOperationId && i % 10 === 0) {
                    console.log('updateAsyncOperation');
                    await app.ms.asyncOperation.updateAsyncOperation(options.userId, options.asyncOperationId, (i + 1) * 50 / groupPosts.length);
                }

                return {
                    id: gp.localId,
                    lang: options.lang,
                    content,
                    images,
                    videos,
                    date: gp.publishedAt.getTime()
                }
            });

            const storeAsset = async (assetContent) => {
                const data = await app.saveData(assetContent, '', {
                    userId: options.userId,
                    groupId: group.id,
                    mimeType: ContentMimeType.Text,
                    waitForPin: true,
                });
                console.log('storeAsset', data.storageId);
                return data.storageId;
            }

            const storeFolder = async (dirPath) => {
                const data = await app.saveDirectoryToStorage(options.userId, dirPath, {
                    userId: options.userId,
                    groupId: group.id,
                    waitForPin: true,
                });
                return data.storageId;
            }

            console.log('createBuildApp');
            const staticSiteApp = createBuildApp({
                base,
                source: __dirname,
                theme: path.resolve(__dirname, './theme'),
                templateBuild: path.resolve(__dirname, './theme/index.ssr.html'),
                plugins: [plugin(posts, options)],
                bundler: '@galtproject/vite',
                bundlerConfig: {
                    baseStorageUri,
                    storeAsset,
                    storeFolder,
                },
            });

            // initialize and prepare
            console.log('staticSiteApp.init');
            await staticSiteApp.init();
            console.log('staticSiteApp.prepare');
            await staticSiteApp.prepare();

            if (options.asyncOperationId) {
                await app.ms.asyncOperation.updateAsyncOperation(options.userId, options.asyncOperationId, 60);
            }
            // build
            // TODO: update percent on build process
            console.log('staticSiteApp.build');
            await staticSiteApp.build();

            // process onGenerated hook
            console.log('staticSiteApp.pluginApi.hooks.onGenerated.process');
            await staticSiteApp.pluginApi.hooks.onGenerated.process(staticSiteApp);

            return app.saveDirectoryToStorage(options.userId, distPath, {
                groupId: group.id,
                userApiKeyId: options.userApiKeyId
            });
        }
    }

    return new StaticSiteGenerator();
}