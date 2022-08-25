import {IGeesomeApp} from "../../interface";
import {IContent} from "../database/interface";
import IGeesomeStaticSiteGeneratorModule, {IStaticSite} from "./interface";

const { path } = require('@vuepress/utils');

const base = '/';
const pIteration = require('p-iteration');
const _ = require('lodash');
const {rmDir} = require('./helpers');
const commonHelper = require('geesome-libs/src/common');
const childProcess = require("child_process");
const fs = require("fs");
let helpers = require('../../helpers');

module.exports = async (app: IGeesomeApp) => {
    app.checkModules(['asyncOperation', 'group', 'content']);
    const module = getModule(app, await require('./models')());
    require('./api')(app, module);
    return module;
}

function getModule(app: IGeesomeApp, models) {
    // temp storage of tokens to pass to child process
    let apiKeyIdToTokenTemp = {

    };

    let finishCallbacks = {

    };

    class StaticSiteGenerator implements IGeesomeStaticSiteGeneratorModule {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId, token, entityType, entityId, options) {
            if (entityType === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, entityId);
                if (!isAdmin) {
                    throw Error('not_enough_rights');
                }
            } else {
                throw Error('unknown_type');
            }
            if (options['name'] && !helpers.validateUsername(options['name'])) {
                throw new Error("incorrect_name");
            }

            const userApiKeyId = await app.getApyKeyId(token);
            apiKeyIdToTokenTemp[userApiKeyId] = token;
            const operationQueue = await app.ms.asyncOperation.addUserOperationQueue(userId, this.moduleName, userApiKeyId, {
                entityType,
                entityId,
                options
            });
            this.processQueue();
            return operationQueue;
        }

        async runRenderAndWaitForFinish(userId, token, entityType, entityId, options) {
            const operationQueue = await this.addRenderToQueueAndProcess(userId, token, entityType, entityId, options);
            const finishedOperation = await new Promise((resolve) => {
                finishCallbacks[operationQueue.id] = resolve;
            });
            delete finishCallbacks[operationQueue.id];
            return finishedOperation;
        }

        async processQueue() {
            const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(this.moduleName);
            // console.log('waitingQueue', waitingQueue);
            if (!waitingQueue) {
                apiKeyIdToTokenTemp = {};
                return;
            }

            // console.log('waitingQueue.asyncOperation', waitingQueue.asyncOperation);
            if (waitingQueue.asyncOperation) {
                if (waitingQueue.asyncOperation.inProcess) {
                    console.log('return');
                    return;
                } else {
                    await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(waitingQueue.asyncOperation.id);
                    return this.processQueue();
                }
            }

            const {userId, userApiKeyId} = waitingQueue;
            const {entityType, entityId, options} = JSON.parse(waitingQueue.inputJson);

            const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
                userApiKeyId,
                name: 'run-' + this.moduleName,
                channel: 'type:' + entityType + ';id:' + entityId + ';op:' + await commonHelper.random()
            });
            // console.log('asyncOperation', asyncOperation);

            await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

            // run in background
            this.generate(userId, entityType, entityId, {
                ...options,
                userApiKeyId,
                asyncOperationId: asyncOperation.id
            }).then(async (content: IContent) => {
                await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id, content.id);
                if (finishCallbacks[waitingQueue.id]) {
                    finishCallbacks[waitingQueue.id](await app.ms.asyncOperation.getAsyncOperation(asyncOperation.userId, asyncOperation.id));
                }
                this.processQueue();
            });

            return waitingQueue;
        }

        async getDefaultOptionsByGroupId(userId, groupId) {
            return this.getDefaultOptions(await app.ms.group.getLocalGroup(userId, groupId));
        }

        async getDefaultOptions(group) {
            const staticSite = await models.StaticSite.findOne({where: {entityType: 'group', entityId: group.id}});

            let staticSiteOptions = {};
            try {
                staticSiteOptions = JSON.parse(staticSite.options)
            } catch (e) {}

            return _.merge({
                lang: 'en',
                dateFormat: 'DD.MM.YYYY hh:mm:ss',
                post: {
                    titleLength: 0,
                    descriptionLength: 400,
                },
                postList: {
                    postsPerPage: 10,
                },
                site: {
                    title: staticSite ? staticSite.title : group.title,
                    name: staticSite ? staticSite.name : group.name + '_site',
                    description: staticSite ? staticSite.description : group.description,
                    username: group.name,
                    base
                }
            }, staticSiteOptions);
        }

        async getResultOptions(group, options) {
            options = _.clone(options) || {};
            const defaultOptions = await this.getDefaultOptions(group);
            const merged = _.merge(defaultOptions, options, {
                site: {
                    avatarStorageId: group.avatarImage ? group.avatarImage.storageId : null,
                    postsCount: group.publishedPostsCount,
                }
            });
            ['post.titleLength', 'post.descriptionLength', 'postList.postsPerPage'].forEach(name => {
                _.set(merged, name, parseInt(_.get(merged, name)))
            });
            if (!merged.site.avatarUrl && merged.site.avatarStorageId) {
                merged.site.avatarUrl = options.baseStorageUri + merged.site.avatarStorageId;
            }
            return merged;
        }

        async generate(userId, entityType, entityId, options: any = {}): Promise<IContent> {
            // console.log('generate', userId, entityType, entityId);
            const distPath = path.resolve(__dirname, './.vuepress/dist');
            rmDir(distPath);

            const {userApiKeyId, baseStorageUri} = options;
            const group = await app.ms.group.getLocalGroup(userId, entityId);
            const staticSite = await models.StaticSite.findOne({where: {entityType, entityId}});
            // console.log('staticSite', staticSite);
            if (staticSite && group.manifestStorageId === staticSite.lastEntityManifestStorageId) {
                console.log('Static site already generated with manifest', group.manifestStorageId, 'and storage id', staticSite.storageId);
                return app.ms.content.getContentByStorageId(staticSite.storageId);
            }
            options = await this.getResultOptions(group, options);

            const {list: groupPosts} = await app.ms.group.getGroupPosts(entityId, {}, {
                sortBy: 'publishedAt',
                sortDir: 'desc',
                limit: 9999,
                offset: 0
            });
            console.log('groupPosts.length', groupPosts.length);

            const posts = await pIteration.mapSeries(groupPosts, async (gp, i) => {
                const contents = await app.ms.group.getPostContentWithUrl(baseStorageUri, gp);
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
                groupId: group.id
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

            const content = await app.ms.content.saveDirectoryToStorage(userId, distPath, {
                groupId: group.id,
                userApiKeyId: options.userApiKeyId
            });
            const baseData = {storageId: content.storageId, lastEntityManifestStorageId: group.manifestStorageId};
            // console.log('baseData', baseData);
            if (staticSite) {
                await this.updateDbStaticSite(staticSite.id, baseData);
            } else {
                await this.createDbStaticSite({...baseData, userId, entityType, entityId, title: options.title, options: JSON.stringify(options)});
            }
            return content;
        }

        async updateDbStaticSite(id, data) {
            return models.StaticSite.update(data, {where: {id}});
        }

        async createDbStaticSite(data) {
            return models.StaticSite.create(data);
        }

        async bindSiteToStaticId(userId, staticSiteId) {
            const staticSite = await models.StaticSite.findOne({where: {id: staticSiteId}});
            if (!staticSite) {
               throw new Error("static_site_not_found");
            }
            const {entityType, entityId, name} = staticSite;
            // console.log('entityType', entityType, 'entityId', entityId, 'name', name);
            let staticId;
            if (entityType === 'group') {
                staticId = await app.ms.staticId.getOrCreateStaticGroupAccountId(userId, entityId, name);
                await app.ms.staticId.bindToStaticIdByGroup(userId, entityId, staticSite.storageId, staticId);
            } else {
                staticId = await app.ms.staticId.getOrCreateStaticAccountId(userId, name);
                await app.ms.staticId.bindToStaticId(userId, staticSite.storageId, staticId);
            }
            return this.updateDbStaticSite(staticSite.id, {staticId, name});
        }

        async getStaticSiteInfo(userId, entityType, entityId) {
            const where: any = {entityType, entityId};
            if (entityType === 'group') {
                if(!(await app.ms.group.canEditGroup(userId, entityId))) {
                    throw new Error("not_permitted");
                }
            } else {
                where.userId = userId;
            }

            return models.StaticSite.findOne({ where }) as IStaticSite;
        }

        isAutoActionAllowed(userId, funcName, funcArgs) {
            return _.includes(['addRenderToQueueAndProcess', 'runRenderAndWaitForFinish', 'bindSiteToStaticId'], funcName);
        }

        async updateStaticSiteInfo(userId, staticSiteId, updateData) {
            const staticSiteInfo = await models.StaticSite.findOne({ where: {id: staticSiteId}}) as IStaticSite;
            const {entityType, entityId, name} = staticSiteInfo;
            if (!staticSiteInfo) {
                throw new Error("static_site_not_found");
            }
            if (updateData['name'] && !helpers.validateUsername(updateData['name'])) {
                throw new Error("incorrect_name");
            }
            if (name && updateData['name'] && updateData['name'] !== name) {
                if (entityType === 'group') {
                    await app.ms.staticId.renameGroupStaticAccountId(userId, entityId, name, updateData['name']);
                } else {
                    await app.ms.staticId.renameStaticAccountId(userId, name, updateData['name']);
                }
            }
            return this.updateDbStaticSite(staticSiteInfo.id, updateData);
        }
    }

    return new StaticSiteGenerator();
}