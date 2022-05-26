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

    class StaticSiteGenerator implements IGeesomeStaticSiteGeneratorModule {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId, token, type, entityId, options) {
            if (type === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, entityId);
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
                entityId,
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
            const {type, entityId, options} = JSON.parse(waitingQueue.inputJson);

            const asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
                userApiKeyId,
                name: 'run-' + this.moduleName,
                channel: 'type:' + type + ';id:' + entityId + ';op:' + await commonHelper.random()
            });

            await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

            // run in background
            this.generateManifest(userId, type, entityId, {
                ...options,
                userApiKeyId,
                asyncOperationId: asyncOperation.id
            }).then(async (content: IContent) => {
                await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id, content.id);
            });

            return app.ms.asyncOperation.getUserOperationQueue(waitingQueue.userId, waitingQueue.id);
        }

        async getDefaultOptionsByGroupId(userId, groupId) {
            return this.getDefaultOptions(await app.ms.group.getLocalGroup(userId, groupId));
        }

        async getDefaultOptions(group, baseStorageUri = null) {
            const staticSite = await models.StaticSite.findOne({where: {type: 'group', entityId: group.id}});

            baseStorageUri = baseStorageUri || 'http://localhost:2052/ipfs/';
            let staticSiteOptions = {};
            try {
                staticSiteOptions = JSON.parse(staticSite.options)
            } catch (e) {}

            return _.merge({
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
                    title: staticSite ? staticSite.title : group.title,
                    name: staticSite ? staticSite.name : group.name + '_site',
                    description: staticSite ? staticSite.description : group.description,
                    avatarUrl: group.avatarImage ? baseStorageUri + group.avatarImage.storageId : null,
                    username: group.name,
                    postsCount: group.publishedPostsCount,
                    base
                }
            }, staticSiteOptions);
        }

        async getResultOptions(group, options) {
            options = _.clone(options) || {};
            const defaultOptions = await this.getDefaultOptions(group, options.baseStorageUri);
            const merged = _.merge(defaultOptions, options);
            ['post.titleLength', 'post.descriptionLength', 'postList.postsPerPage'].forEach(name => {
                _.set(merged, name, parseInt(_.get(merged, name)))
            });
            return merged;
        }

        async generateManifest(userId, type, entityId, options: any = {}): Promise<IContent> {
            const distPath = path.resolve(__dirname, './.vuepress/dist');
            rmDir(distPath);

            const {userApiKeyId} = options;
            const group = await app.ms.group.getLocalGroup(userId, entityId);
            options = await this.getResultOptions(group, options);

            console.log('getGroupPosts', entityId);
            const {list: groupPosts} = await app.ms.group.getGroupPosts(entityId, {}, {
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
                groupId: entityId
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
            const staticSite = await models.StaticSite.findOne({where: {type, entityId}});
            if (staticSite) {
                await models.StaticSite.update({storageId: content.storageId}, {where: {type, entityId}});
            } else {
                await models.StaticSite.create({userId, type, entityId, storageId: content.storageId, title: options.title, options: JSON.stringify(options)});
            }
            return content;
        }

        async bindSiteToStaticId(userId, type, entityId, name) {
            const staticSite = await models.StaticSite.findOne({where: {type, entityId}});
            if (!staticSite) {
               throw new Error("static_site_not_found");
            }
            let staticId;
            if (name === 'group') {
                staticId = await app.ms.staticId.getOrCreateStaticGroupAccountId(userId, entityId, name);
                await app.ms.staticId.bindToStaticIdByGroup(userId, entityId, staticSite.storageId, staticId);
            } else {
                staticId = await app.ms.staticId.getOrCreateStaticAccountId(userId, name);
                await app.ms.staticId.bindToStaticId(userId, staticSite.storageId, staticId);
            }
            return models.StaticSite.update({staticId, name}, {where: {type, entityId}});
        }

        async getStaticSiteInfo(userId, type, entityId) {
            const where: any = {type, entityId};
            if (type === 'group') {
                if(!(await app.ms.group.canEditGroup(userId, entityId))) {
                    throw new Error("not_permitted");
                }
            } else {
                where.userId = userId;
            }

            return models.StaticSite.findOne({ where }) as IStaticSite;
        }
    }

    return new StaticSiteGenerator();
}