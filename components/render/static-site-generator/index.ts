import {IGeesomeApp} from "../../app/interface";
import {ContentMimeType, IContent} from "../../database/interface";

const {createBuildApp} = require('@vuepress/core');
const { path } = require('@vuepress/utils');

const base = '/';
const plugin = require('./plugin');
const pIteration = require('p-iteration');
const _ = require('lodash');
const {rmDir} = require('./helpers');
const commonHelper = require('geesome-libs/src/common');

module.exports = async (app: IGeesomeApp) => {
    return new StaticSiteGenerator(app);
}

class StaticSiteGenerator {
    app: IGeesomeApp;
    moduleName = 'static-site-generator';

    constructor(_app: IGeesomeApp) {
        this.app = _app;

        ['run-for-group', 'get-default-options'].forEach(method => {
            _app.api.post(`/v1/render/${this.moduleName}/` + method, async (req, res) => {
                if (!req.user || !req.user.id) {
                    return res.send(401);
                }
                const userId = req.user.id;
                if (method === 'get-default-options') {
                    return res.send(await this.getDefaultOptionsByGroupId(req.body.id), 200);
                }
                if (method === 'run-for-group') {
                    return res.send(await this.addRenderToQueueAndProcess(userId, req.token, 'group', req.body.id, req.body.options), 200);
                }
            });
        });
    }

    async addRenderToQueueAndProcess(userId, apiKey, type, id, options) {
        if (type === 'group') {
            const isAdmin = await this.app.isAdminInGroup(userId, id);
            if (!isAdmin) {
                throw Error('not_enough_rights');
            }
        } else {
            throw Error('unknown_type');
        }

        const apiKeyId = await this.app.getApyKeyId(apiKey);
        console.log('apiKeyId', apiKeyId);
        await this.app.addUserOperationQueue(userId, this.moduleName, apiKeyId, {type, id, options});
        return this.processQueue();
    }

    async processQueue() {
        const waitingQueue = await this.app.getWaitingOperationByModule(this.moduleName);
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
                await this.app.closeUserOperationQueueByAsyncOperationId(waitingQueue.asyncOperation.id);
                return this.processQueue();
            }
        }

        const {userId, userApiKeyId} = waitingQueue;
        const {type, id, options} = JSON.parse(waitingQueue.inputJson);

        const asyncOperation = await this.app.addAsyncOperation(userId, {
            userApiKeyId,
            name: 'run-' + this.moduleName,
            channel: 'type:' + type + ';id:' + id + ';op:' + await commonHelper.random()
        });

        await this.app.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

        // run in background
        this.generateContent(type, id, {
            ...options,
            userId,
            userApiKeyId,
            asyncOperationId: asyncOperation.id
        }).then(async (content: IContent) => {
            await this.app.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
            await this.app.finishAsyncOperation(userId, asyncOperation.id, content.id);
            if (type === 'group') {
                const group = await this.app.getGroup(id);
                const properties = group.propertiesJson ? JSON.parse(group.propertiesJson) : {};
                properties.staticSiteManifestStorageId = content.manifestStorageId;
                await this.app.updateGroup(userId, id, { propertiesJson: JSON.stringify(properties) });
            }
        });

        return this.app.getUserOperationQueue(waitingQueue.userId, waitingQueue.id);
    }

    async getDefaultOptionsByGroupId(groupId) {
        return this.getDefaultOptions(await this.app.getGroup(groupId));
    }

    getDefaultOptions(group, baseStorageUri = null) {
        baseStorageUri = baseStorageUri || 'http://localhost:7711/v1/content-data/';
        return {
            baseStorageUri,
            lang: 'en',
            dateFormat: 'ddd MMM DD YYYY',
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
                avatarUrl: baseStorageUri + group.avatarImage.storageId,
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

    async generateContent(name, data, options: any = {}): Promise<IContent>{
        const distPath = path.resolve(__dirname, './.vuepress/dist');
        rmDir(distPath);

        const group = await this.app.getGroup(data);
        let properties = {};
        try {
            if (group.propertiesJson) {
                properties = JSON.parse(group.propertiesJson);
            }
        } catch (e) { }
        options = this.getResultOptions(group, _.merge(properties, options));

        console.log('getGroupPosts', data);
        const {list: groupPosts} = await this.app.getGroupPosts(data, {}, {sortBy: 'publishedAt', sortDir: 'desc', limit: 9999, offset: 0});
        console.log('groupPosts.length', groupPosts.length);
        const { baseStorageUri } = options;

        const posts = await pIteration.mapSeries(groupPosts, async (gp, i) => {
            console.log('groupPosts i', i);
            let content = '';
            const textContent = _.find(gp.contents, c => c.mimeType === 'text/plain');
            if (textContent) {
                console.log('textContent.storageId', textContent.storageId);
                content = await this.app.storage.getFileDataText(textContent.storageId);
            }
            const images = [];
            const videos = [];
            gp.contents.forEach((c) => {
                if (_.includes(c.mimeType, 'image')) {
                    images.push({
                        manifestId: c.manifestStorageId,
                        url: baseStorageUri + c.storageId
                    });
                } else if (_.includes(c.mimeType, 'video')) {
                    videos.push({
                        manifestId: c.manifestStorageId,
                        previewUrl: baseStorageUri + c.mediumPreviewStorageId,
                        url: baseStorageUri + c.storageId
                    });
                }
            });

            if (options.asyncOperationId && i % 10 === 0) {
                console.log('updateAsyncOperation');
                await this.app.updateAsyncOperation(options.userId, options.asyncOperationId, (i + 1) * 50 / groupPosts.length);
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
            const data = await this.app.saveData(assetContent, '', {
                userId: options.userId,
                groupId: group.id,
                mimeType: ContentMimeType.Text,
                waitForPin: true,
            });
            console.log('storeAsset', data.storageId);
            return data.storageId;
        }

        console.log('createBuildApp');
        const staticSiteApp = createBuildApp({
            base,
            source: __dirname,
            theme: path.resolve(__dirname, './theme'),
            templateSSR: path.resolve(__dirname, './theme/index.ssr.html'),
            plugins: [plugin(posts, options)],
            bundler: '@galtproject/vite',
            bundlerConfig: {
                baseStorageUri,
                storeAsset
            },
        })

        // initialize and prepare
        console.log('staticSiteApp.init');
        await staticSiteApp.init();
        console.log('staticSiteApp.prepare');
        await staticSiteApp.prepare();

        if (options.asyncOperationId) {
            await this.app.updateAsyncOperation(options.userId, options.asyncOperationId, 60);
        }
        // build
        // TODO: update percent on build process
        console.log('staticSiteApp.build');
        await staticSiteApp.build();

        // process onGenerated hook
        console.log('staticSiteApp.pluginApi.hooks.onGenerated.process');
        await staticSiteApp.pluginApi.hooks.onGenerated.process(staticSiteApp);

        return this.app.saveDirectoryToStorage(options.userId, distPath, {
            groupId: group.id,
            userApiKeyId: options.userApiKeyId
        });
    }
}