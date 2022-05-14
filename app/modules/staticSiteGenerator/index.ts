import {IGeesomeApp} from "../../interface";
import {IContent} from "../database/interface";

const { path } = require('@vuepress/utils');

const base = '/';
const pIteration = require('p-iteration');
const _ = require('lodash');
const {rmDir} = require('./helpers');
const commonHelper = require('geesome-libs/src/common');
const childProcess = require("child_process");
const fs = require("fs");

module.exports = (app: IGeesomeApp) => {
    const module = getModule(app);
    require('./api')(app, module);
    return module;
}

function getModule(app: IGeesomeApp) {
    app.checkModules(['asyncOperation', 'group', 'content']);

    // temp storage of tokens to pass to child process
    let apiKeyIdToTokenTemp = {

    };

    class StaticSiteGenerator {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId, token, type, id, options) {
            if (type === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, id);
                if (!isAdmin) {
                    throw Error('not_enough_rights');
                }
            } else {
                throw Error('unknown_type');
            }

            const userApiKeyId = await app.getApyKeyId(token);
            apiKeyIdToTokenTemp[userApiKeyId] = token;
            await app.ms.asyncOperation.addUserOperationQueue(userId, this.moduleName, userApiKeyId, {
                type,
                id,
                options
            });
            return this.processQueue();
        }

        async processQueue() {
            const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(this.moduleName);
            if (!waitingQueue) {
                apiKeyIdToTokenTemp = {};
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
            this.generateContent(userId, type, id, {
                ...options,
                userApiKeyId,
                asyncOperationId: asyncOperation.id
            }).then(async (content: IContent) => {
                await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id, content.id);
                if (type === 'group') {
                    const group = await app.ms.group.getLocalGroup(userId, id);
                    const properties = group.propertiesJson ? JSON.parse(group.propertiesJson) : {};
                    properties.staticSiteManifestStorageId = content.manifestStorageId;
                    await app.ms.group.updateGroup(userId, id, {propertiesJson: JSON.stringify(properties)});
                }
            });

            return app.ms.asyncOperation.getUserOperationQueue(waitingQueue.userId, waitingQueue.id);
        }

        async getDefaultOptionsByGroupId(userId, groupId) {
            return this.getDefaultOptions(await app.ms.group.getLocalGroup(userId, groupId));
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
                _.set(merged, name, parseInt(_.get(merged, name)))
            });
            return merged;
        }

        async generateContent(userId, name, groupId, options: any = {}): Promise<IContent> {
            const distPath = path.resolve(__dirname, './.vuepress/dist');
            rmDir(distPath);

            const {userApiKeyId} = options;

            const group = await app.ms.group.getLocalGroup(userId, groupId);
            let properties = {};
            try {
                if (group.propertiesJson) {
                    properties = JSON.parse(group.propertiesJson);
                }
            } catch (e) {
            }
            options = this.getResultOptions(group, _.merge(properties, options));

            console.log('getGroupPosts', groupId);
            const {list: groupPosts} = await app.ms.group.getGroupPosts(groupId, {}, {
                sortBy: 'publishedAt',
                sortDir: 'desc',
                limit: 9999,
                offset: 0
            });
            console.log('groupPosts.length', groupPosts.length);
            const {baseStorageUri} = options;

            const posts = await pIteration.mapSeries(groupPosts, async (gp, i) => {
                const contents = await app.ms.group.getPostContent(baseStorageUri, gp);
;
                if (options.asyncOperationId && i % 10 === 0) {
                    await app.ms.asyncOperation.updateAsyncOperation(userId, options.asyncOperationId, (i + 1) * 50 / groupPosts.length);
                }

                return {
                    id: gp.localId,
                    lang: options.lang,
                    contents: contents,
                    texts: contents.filter(c => c.type === 'text'),
                    images: contents.filter(c => c.type === 'image'),
                    videos: contents.filter(c => c.type === 'video'),
                    date: gp.publishedAt.getTime()
                }
            });

            const childProcessData = {
                token: apiKeyIdToTokenTemp[userApiKeyId],
                port: app.ms.api.port,
                base,
                posts,
                options,
                bundlerConfig: { baseStorageUri },
                groupId
            };

            if (process.env.SSG_RUNTIME) {
                await require('./build')(childProcessData);
            } else {
                fs.writeFileSync(path.resolve(__dirname, 'childProcessData.json'), JSON.stringify(childProcessData), {encoding: 'utf8'});

                await new Promise((resolve, reject) => {
                    childProcess.exec("node " + path.resolve(__dirname, 'childProcess.js'), (e, output) => e ? reject(e) : resolve(output));
                });
            }

            // if (options.asyncOperationId) {
            //     await app.ms.asyncOperation.updateAsyncOperation(options.userId, options.asyncOperationId, 60);
            // }

            return app.ms.content.saveDirectoryToStorage(userId, distPath, {
                groupId: group.id,
                userApiKeyId: options.userApiKeyId
            });
        }
    }

    return new StaticSiteGenerator();
}