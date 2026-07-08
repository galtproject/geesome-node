import fs from 'fs';
import _ from 'lodash';
import debug from 'debug';
import pIteration from 'p-iteration';
import commonHelper from "geesome-libs/src/common.js";
import IGeesomeStaticSiteGeneratorModule, {IStaticSite, IStaticSiteRenderArgs} from "./interface.js";
import {IContentData, IContentDataProjectionOptions, IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from '../../helpers.js';
import ssgHelpers from './helpers.js';
import site from './site/index.js';
import vendorAssets from './site/vendorAssets.js';
const {clone, uniq, merge, pick, last} = _;
const log = debug('geesome:app:staticSiteGenerator');
const {getPostTitleAndDescription, getOgHeaders, sanitizeStaticSiteContents, sanitizeStaticSiteHtml} = ssgHelpers;
const {prepareRender} = site;
const base = '/';
let publicDirStorageId, faviconStorageId, vendorAssetsStorageId;
const customStylesCssMaxLength = 128 * 1024;
const generatedGroupPostsLimit = 9999;
const generatedGroupPostBatchLimit = 100;
const generatedOutputCacheLimit = helpers.parsePositiveInteger(process.env.GENERATED_OUTPUT_CACHE_LIMIT, 500);
const staticSiteListParams: IListParamsOptions = {
    sortBy: 'updatedAt',
    allowedSortBy: ['createdAt', 'updatedAt', 'id', 'name', 'entityType', 'entityId'],
    maxLimit: 100
};

type StaticSiteRenderCache = {
    bodyTextCache: Map<string, string>;
    postObjects: Map<number, any>;
    maxEntries: number;
};

export function createStaticSiteRenderCache(): StaticSiteRenderCache {
    return {
        bodyTextCache: new Map(),
        postObjects: new Map(),
        maxEntries: generatedOutputCacheLimit
    };
}

function getContentProjectionOptions(renderCache: StaticSiteRenderCache): IContentDataProjectionOptions {
    return {
        bodyTextCache: renderCache.bodyTextCache,
        bodyTextCacheMaxEntries: renderCache.maxEntries
    };
}

function getCachedPostObject(renderCache: StaticSiteRenderCache, postId) {
    const postObject = renderCache.postObjects.get(postId);
    if (postObject) {
        renderCache.postObjects.delete(postId);
        renderCache.postObjects.set(postId, postObject);
    }
    return postObject;
}

function setCachedPostObject(renderCache: StaticSiteRenderCache, postId, postObject) {
    if (renderCache.maxEntries <= 0) {
        return;
    }
    if (renderCache.postObjects.has(postId)) {
        renderCache.postObjects.delete(postId);
    }
    while (renderCache.postObjects.size >= renderCache.maxEntries) {
        const oldestKey = renderCache.postObjects.keys().next().value;
        if (oldestKey === undefined) {
            break;
        }
        renderCache.postObjects.delete(oldestKey);
    }
    renderCache.postObjects.set(postId, postObject);
}

function parsePositiveInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return Math.min(Math.max(parsed, min), max);
}

function validateStaticSiteName(name) {
    if (name && !helpers.validateUsername(name)) {
        throw new Error("incorrect_name");
    }
}

function normalizeStaticSiteOptions(options: any = {}) {
    const normalized = clone(options) || {};
    normalized.post = normalized.post || {};
    normalized.postList = normalized.postList || {};
    normalized.site = normalized.site || {};

    validateStaticSiteName(normalized.name);
    validateStaticSiteName(normalized.site.name);

    normalized.post.titleLength = parsePositiveInteger(normalized.post.titleLength, 0, 0, 500);
    normalized.post.descriptionLength = parsePositiveInteger(normalized.post.descriptionLength, 400, 0, 5000);
    normalized.postList.postsPerPage = parsePositiveInteger(normalized.postList.postsPerPage, 10, 1, 100);

    if (normalized.stylesCss !== undefined) {
        if (typeof normalized.stylesCss !== 'string') {
            throw new Error("incorrect_styles_css");
        }
        if (normalized.stylesCss.length > customStylesCssMaxLength) {
            throw new Error("styles_css_too_large");
        }
    }
    normalized.headerHtml = normalizeStaticSiteHtmlOption(normalized.headerHtml, 'incorrect_header_html');
    normalized.footerHtml = normalizeStaticSiteHtmlOption(normalized.footerHtml, 'incorrect_footer_html');

    return normalized;
}

function normalizeStaticSiteHtmlOption(html, errorMessage) {
    if (html === undefined || html === null) {
        return html;
    }
    if (typeof html !== 'string') {
        throw new Error(errorMessage);
    }
    return sanitizeStaticSiteHtml(html);
}

function prepareStaticSiteUpdateData(updateData) {
    const prepared = clone(updateData) || {};
    validateStaticSiteName(prepared.name);
    if (prepared.options !== undefined) {
        const parsedOptions = typeof prepared.options === 'string' ? JSON.parse(prepared.options) : prepared.options;
        prepared.options = JSON.stringify(normalizeStaticSiteOptions(parsedOptions));
    }
    return prepared;
}

function getNonNegativeCount(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const count = Number(value);
    if (!Number.isFinite(count)) {
        return null;
    }
    return Math.max(0, Math.floor(count));
}

function getGroupSitePostsCount(group) {
    const availablePostsCount = getNonNegativeCount(group?.availablePostsCount);
    if (availablePostsCount !== null) {
        return availablePostsCount;
    }
    const localIdHighWater = getNonNegativeCount(group?.publishedPostsCount);
    if (localIdHighWater !== null) {
        return localIdHighWater;
    }

    return 0;
}

export default async (app: IGeesomeApp) => {
    // VueSSR: import JS [type: module] (by workspaces in package.json)
    app.checkModules(['asyncOperation', 'group', 'content']);
    const module = await getModule(app, await (await import('./models.js')).default(app.ms.database.sequelize));
    (await import('./api.js')).default(app, module);
    return module;
}

export async function getModule(app: IGeesomeApp, models) {
    let finishCallbacks = {

    };

    class StaticSiteGenerator implements IGeesomeStaticSiteGeneratorModule {
        moduleName = 'static-site-generator';

        async addRenderToQueueAndProcess(userId: number, userApiKeyId: number, renderArgs: IStaticSiteRenderArgs, options: any) {
            const {entityType, entityId, entityIds} = renderArgs;
            if (entityType === 'group') {
                const isAdmin = await app.ms.group.isAdminInGroup(userId, entityId);
                if (!isAdmin) {
                    throw Error('not_enough_rights');
                }
            } else if (entityType === 'content-list') {
                if (!entityIds || !entityIds.length || entityIds.length > 9999) {
                    throw Error('invalid_entity_ids');
                }
            } else {
                throw Error('unknown_type');
            }
            options = normalizeStaticSiteOptions(options);

            const operationQueue = await app.ms.asyncOperation.addUserOperationQueue(userId, this.moduleName, userApiKeyId, {
                renderArgs,
                options
            });
            this.processQueue();
            return operationQueue;
        }

        async runRenderAndWaitForFinish(userId, apiKeyId, entityType, entityId, options) {
            const operationQueue = await this.addRenderToQueueAndProcess(userId, apiKeyId, {entityType, entityId}, options);
            const finishedOperation = await new Promise((resolve) => {
                finishCallbacks[operationQueue.id] = resolve;
            });
            delete finishCallbacks[operationQueue.id];
            return finishedOperation;
        }

        entityIdsToKey(entityIds) {
            return helpers.keccak(JSON.stringify(entityIds));
        }

        async processQueue() {
            const waitingQueue = await app.ms.asyncOperation.getWaitingOperationByModule(this.moduleName);
            log('waitingQueue', waitingQueue);
            if (!waitingQueue) {
                return;
            }
            log('waitingQueue.asyncOperation', waitingQueue.asyncOperation);
            if (waitingQueue.asyncOperation) {
                if (waitingQueue.asyncOperation.inProcess) {
                    log('return');
                    return;
                } else {
                    await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(waitingQueue.asyncOperation.id);
                    return this.processQueue();
                }
            }

            const {userId, userApiKeyId} = waitingQueue;
            let asyncOperation;
            try {
                const {renderArgs, options} = JSON.parse(waitingQueue.inputJson);
                const {entityType, entityId, entityIds} = renderArgs;
                let operationPrefix;
                if (entityType === 'content-list') {
                    operationPrefix = 'type:' + entityType + ';id:' + this.entityIdsToKey(entityIds);
                } else {
                    operationPrefix = 'type:' + entityType + ';id:' + entityId;
                }
                asyncOperation = await app.ms.asyncOperation.addAsyncOperation(userId, {
                    userApiKeyId,
                    module: this.moduleName,
                    name: 'run-' + this.moduleName + '-' + entityType,
                    channel: operationPrefix + ';op:' + await commonHelper.random()
                });

                await app.ms.asyncOperation.setAsyncOperationToUserOperationQueue(waitingQueue.id, asyncOperation.id);

                options.asyncOperationId = asyncOperation.id;
                const generateSite = entityType === 'content-list'
                    ? this.generateContentListSite(userId, renderArgs, options)
                    : this.generateGroupSite(userId, renderArgs, options).then(storageId => ({storageId, staticSiteId: null}));
                await generateSite.then(async ({storageId, staticSiteId}) => {
                    await app.ms.asyncOperation.closeUserOperationQueueByAsyncOperationId(asyncOperation.id);
                    await app.ms.asyncOperation.finishAsyncOperation(userId, asyncOperation.id, null, JSON.stringify({storageId, staticSiteId}));
                    if (finishCallbacks[waitingQueue.id]) {
                        finishCallbacks[waitingQueue.id](await app.ms.asyncOperation.getAsyncOperation(asyncOperation.userId, asyncOperation.id));
                    }
                })
            } catch (e) {
                console.error('processQueue', e);
                if (asyncOperation) {
                    await app.ms.asyncOperation.errorAsyncOperation(userId, asyncOperation.id, e.message);
                    if (finishCallbacks[waitingQueue.id]) {
                        finishCallbacks[waitingQueue.id](await app.ms.asyncOperation.getAsyncOperation(asyncOperation.userId, asyncOperation.id));
                    }
                } else {
                    await app.ms.asyncOperation.closeUserOperationQueue(waitingQueue.id);
                }
                delete finishCallbacks[waitingQueue.id];
            }
            this.processQueue();

            return waitingQueue;
        }

        async isStorageIdAllowed(storageId: string): Promise<boolean> {
            return this.getStaticSiteByStorageId(storageId).then(site => !!site);
        }

        async getStaticSiteByStorageId(storageId: string): Promise<boolean> {
            return models.StaticSite.findOne({where: {storageId}});
        }

        async getDefaultOptionsByGroupId(userId: number, groupId: number) {
            return this.getEntityDefaultOptions('group', await app.ms.group.getLocalGroup(userId, groupId));
        }

        async getDefaultOptionsByRenderArgs(userId: number, renderArgs: IStaticSiteRenderArgs) {
            const {entityType, entityId} = renderArgs;
            let entity;
            if (entityType === 'group') {
                entity = await app.ms.group.getLocalGroup(userId, entityId);
            }
            return this.getEntityDefaultOptions(renderArgs.entityType, entity);
        }

        async getEntityDefaultOptions(entityType, entity) {
            const staticSite = await models.StaticSite.findOne({where: {entityType, entityId: entity.id.toString()}});
            let staticSiteOptions = {};
            try {
                staticSiteOptions = JSON.parse(staticSite.options)
            } catch (e) {}
            return normalizeStaticSiteOptions({
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
                    title: staticSite ? staticSite.title : entity.title,
                    name: staticSite ? staticSite.name : entity.name + '_site',
                    description: staticSite ? staticSite.description : entity.description,
                    username: entity.name,
                    base
                },
                ...staticSiteOptions
            });
        }

        async getGroupResultOptions(group, options) {
            options = clone(options) || {};
            options.view = options.view || group.view;
            const defaultOptions = await this.getEntityDefaultOptions('group', group);
            const merged = merge(defaultOptions, options, {
                site: {
                    avatarStorageId: group.avatarImage ? group.avatarImage.storageId : null,
                    postsCount: getGroupSitePostsCount(group),
                }
            });
            const normalized = normalizeStaticSiteOptions(merged);
            if (!normalized.site.avatarUrl && normalized.site.avatarStorageId) {
                normalized.site.avatarUrl = options.baseStorageUri + normalized.site.avatarStorageId;
            }
            return normalized;
        }

        async prepareContentListForRender(userId, entityType, entityIds, options: any = {}) {
            let staticSite = await this.getOrCreateStaticSite(userId, entityType, this.entityIdsToKey(entityIds), options);

            const renderCache = createStaticSiteRenderCache();
            let contents = await app.ms.database
                .getUserContentListByIds(userId, uniq(entityIds))
                .then(list => Promise.all(list.map(c => {
                    return app.ms.group.prepareContentDataWithUrl(c, '', getContentProjectionOptions(renderCache));
                })));
            contents = sanitizeStaticSiteContents(contents);
            const contentById = {};
            contents.forEach(c => contentById[c.id] = c);
            contents = entityIds.map(entityId => contentById[entityId]);
            const siteStorageDir = `/${staticSite.staticId}-site`;

            await app.ms.storage.makeDir(siteStorageDir).catch(() => {/*already made*/});
            await this.copyContentsToSite(siteStorageDir, contents, true);

            return {
                staticSite,
                siteStorageDir,
                renderData: {
                    contents,
                    options //TODO: vulnerability?
                }
            }
        }

        async preparePostObjectsForRender(userId, options, siteStorageDir, groupPosts, renderedCount, renderProgressTotal, renderCache: StaticSiteRenderCache) {
            return pIteration.mapSeries(groupPosts, async (post) => {
                renderedCount.count += 1;
                if (options.asyncOperationId && renderedCount.count % 10 === 0) {
                    await app.ms.asyncOperation.updateAsyncOperation(
                        userId,
                        options.asyncOperationId,
                        Math.min(50, renderedCount.count * 50 / renderProgressTotal)
                    );
                }
                return this.postToObj(options, siteStorageDir, post, renderCache);
            });
        }

        async prepareGroupSiteRenderContext(userId, entityType, entityId, options: any = {}) {
            const group = await app.ms.group.getLocalGroup(userId, entityId);
            options = await this.getGroupResultOptions(group, options);
            let staticSite = await this.getOrCreateStaticSite(userId, entityType, entityId, options);

            const siteStorageDir = `/${staticSite.staticId}-site`;
            await app.ms.storage.makeDir(siteStorageDir).catch(() => {/*already made*/});

            const postsPerPage = options.postList.postsPerPage;
            const renderPostCount = Math.min(await app.ms.group.getGroupPostsCount(entityId), generatedGroupPostsLimit);

            return {
                staticSite,
                siteStorageDir,
                manifestStorageId: group.manifestStorageId,
                renderPostCount,
                renderData: {
                    options, //TODO: vulnerability?
                    posts: [],
                    currentPosts: [],
                    currentPost: null,
                    pagesCount: Math.ceil(renderPostCount / postsPerPage),
                    postsPerPage,
                    indexById: {}
                }
            }
        }

        async renderGroupPostListPage(renderPage, renderOptions, siteStorageDir, renderData, pagePosts, pageIndex) {
            renderData.currentPosts = pagePosts;
            renderData.currentPost = null;
            const pageNumber = renderData.pagesCount - pageIndex;
            const routePath = pageIndex === 0 ? `` : `/page/${pageNumber}`;
            const type = pageIndex === 0 ? 'main' : 'page';
            await this.renderAndSave(renderPage, renderOptions, siteStorageDir, routePath, type);
        }

        async renderGroupPostPage(renderPage, renderOptions, siteStorageDir, renderData, postObject) {
            renderData.currentPosts = [];
            renderData.currentPost = postObject;
            await this.renderAndSave(renderPage, renderOptions, siteStorageDir, `/post/${postObject.id}`, 'post', postObject);
        }

        async renderGroupPostBatchPages(userId, entityId, renderPage, renderOptions, siteStorageDir, renderData, renderPostCount) {
            if (renderPostCount === 0) {
                await this.renderGroupPostListPage(renderPage, renderOptions, siteStorageDir, renderData, [], 0);
                return;
            }

            const renderedCount = {count: 0};
            const renderProgressTotal = Math.max(1, renderPostCount);
            const renderCache = createStaticSiteRenderCache();
            let pagePosts = [];
            let pageIndex = 0;

            const flushPage = async () => {
                await this.renderGroupPostListPage(renderPage, renderOptions, siteStorageDir, renderData, pagePosts, pageIndex);
                pagePosts = [];
                pageIndex += 1;
            };

            await app.ms.group.forEachHydratedGroupPostBatch(entityId, {
                maxRefs: renderPostCount,
                batchLimit: generatedGroupPostBatchLimit,
                listParams: {
                    sortBy: 'publishedAt',
                    sortDir: 'desc'
                },
                hydrateOptions: {
                    includeRepostOf: true
                }
            }, async ({groupPosts}) => {
                const postObjects = await this.preparePostObjectsForRender(userId, renderOptions, siteStorageDir, groupPosts, renderedCount, renderProgressTotal, renderCache);
                await pIteration.forEachSeries(postObjects, async (postObject) => {
                    await this.renderGroupPostPage(renderPage, renderOptions, siteStorageDir, renderData, postObject);
                    pagePosts.push(postObject);
                    if (pagePosts.length >= renderData.postsPerPage) {
                        await flushPage();
                    }
                });
            });

            if (pagePosts.length) {
                await flushPage();
            }
        }

        async getOrCreateStaticSite(userId, entityType, entityId, options) {
            const {site} = options;
            if (!site || !site.name || !site.title) {
                throw new Error("incorrect_static_site_options");
            }
            let staticSite = await models.StaticSite.findOne({where: {entityType, entityId: entityId.toString()}});
            if (!staticSite) {
                staticSite = await this.createDbStaticSite({userId, entityType, entityId, title: site.title, name: site.name, options: JSON.stringify(options)});
                await this.bindSiteToStaticId(userId, staticSite.id);
                staticSite = await models.StaticSite.findOne({where: {id: staticSite.id}});
            }
            return staticSite;
        }

        async generateGroupSite(userId, renderArgs: IStaticSiteRenderArgs, options: any = {}): Promise<string> {
            // log('generateGroupSite', {userId, entityType, entityId, options});
            const {entityType, entityId} = renderArgs;
            const {
                staticSite,
                siteStorageDir,
                renderData,
                manifestStorageId,
                renderPostCount
            } = await this.prepareGroupSiteRenderContext(userId, entityType, entityId, options);
            const renderOptions = renderData.options;

            // VueSSR: initialize app
            const {renderPage, css} = await prepareRender(renderData);
            const {id: cssStorageId} = await app.ms.storage.saveFileByData(css + (renderOptions.stylesCss || ''));
            await app.ms.storage.copyFileFromId(cssStorageId, `${siteStorageDir}/style.css`);

            // VueSSR: render main page
            /*  Example for file write:
                async renderAndWrite(renderPage, routePath) {
                    const htmlContent = await renderPage(routePath);
                    fs.writeFileSync(routePath + '/index.html', htmlContent);
                }
             */
            await this.copySiteAssets(siteStorageDir, renderData.options.site.avatarStorageId);

            await this.renderGroupPostBatchPages(userId, entityId, renderPage, renderOptions, siteStorageDir, renderData, renderPostCount);

            const storageId = await app.ms.storage.getDirectoryId(siteStorageDir);
            const baseData = {storageId, lastEntityManifestStorageId: manifestStorageId, options: JSON.stringify(renderOptions)};
            await this.updateDbStaticSite(staticSite.id, baseData);
            return storageId;
        }

        async saveSiteAssets() {
            if (!publicDirStorageId) {
                ({id: publicDirStorageId} = await app.ms.storage.saveDirectory(`${helpers.getCurDir()}/modules/staticSiteGenerator/site/public`));
            }
            if (!faviconStorageId) {
                const uiPath = `${helpers.getCurDir()}/../node_modules/@geesome/ui`;
                let faviconPath;
                try {
                    fs.readdirSync(uiPath).some(name => {
                        if (name.startsWith('favicon.')) {
                            faviconPath = `${uiPath}/${name}`;
                            return true;
                        }
                    });
                    if (!faviconPath) {
                        faviconPath = `${uiPath}/assets/favicon.ico`;
                    }
                    ({id: faviconStorageId} = await app.ms.storage.saveFileByPath(faviconPath));
                } catch (e) {
                    console.warn('ssg favicon', e);
                }
            }
            if (!vendorAssetsStorageId) {
                const vendorAssetsDirectory = '/ssgVendorAssets'
                await app.ms.storage.makeDir(vendorAssetsDirectory).catch(() => {/*already made*/});

                const vendorAssetsLit = Object.keys(vendorAssets);
                await pIteration.forEachSeries(vendorAssetsLit, async (a) => {
                    const assetPath = vendorAssets[a];
                    let assetStorageId;
                    if (assetPath.endsWith('/')) {
                        ({id: assetStorageId} = await app.ms.storage.saveDirectory(assetPath));
                    } else {
                        ({id: assetStorageId} = await app.ms.storage.saveFileByPath(assetPath));
                    }
                    await app.ms.storage.copyFileFromId(assetStorageId, `${vendorAssetsDirectory}/${a}`);
                });
                vendorAssetsStorageId = await app.ms.storage.getDirectoryId(vendorAssetsDirectory);
            }
        }

        async copySiteAssets(siteStorageDir: string, faviconSourceStorageId?: string) {
            await this.saveSiteAssets();
            await app.ms.storage.copyFileFromId(publicDirStorageId, `${siteStorageDir}/public`);
            await app.ms.storage.copyFileFromId(vendorAssetsStorageId, `${siteStorageDir}/vendor`);
            const faviconId = faviconSourceStorageId || faviconStorageId;
            if (faviconId) {
                await app.ms.storage.copyFileFromId(faviconId, `${siteStorageDir}/favicon.ico`);
            }
        }

        async generateContentListSite(userId, renderArgs: IStaticSiteRenderArgs, options: any = {}): Promise<{storageId, staticSiteId}> {
            options = normalizeStaticSiteOptions(options);
            const {entityType, entityIds} = renderArgs;
            const {
                staticSite,
                siteStorageDir,
                renderData,
            } = await this.prepareContentListForRender(userId, entityType, entityIds, options);

            const {renderPage, css} = await prepareRender(renderData);
            const {id: cssStorageId} = await app.ms.storage.saveFileByData(css + (options.stylesCss || ''));
            await app.ms.storage.copyFileFromId(cssStorageId, `${siteStorageDir}/style.css`);

            await this.copySiteAssets(siteStorageDir);

            renderData.defaultRoute = 'content-list';

            const {id: clientDataStorageId} = await app.ms.storage.saveFileByData('export default ' + JSON.stringify(renderData));
            await app.ms.storage.copyFileFromId(clientDataStorageId, `${siteStorageDir}/clientData.js`);

            await this.renderAndSave(renderPage, options, siteStorageDir, `/${renderData.defaultRoute}`, 'simple');
            log('renderAndSave done');
            const storageId = await app.ms.storage.getDirectoryId(siteStorageDir);
            log('getDirectoryId storageId', storageId);
            const baseData = {storageId, options: JSON.stringify(options)};
            await this.updateDbStaticSite(staticSite.id, baseData);
            return {storageId, staticSiteId: staticSite.id};
        }

        async postToObj(options, siteStorageDir, gp, renderCache: StaticSiteRenderCache = createStaticSiteRenderCache()) {
            if (!gp) {
                return null;
            }
            if (gp.id) {
                const cachedPostObject = getCachedPostObject(renderCache, gp.id);
                if (cachedPostObject) {
                    return cachedPostObject;
                }
            }

            const contents = sanitizeStaticSiteContents(
                await app.ms.group.getPostContentDataWithUrl(gp, '', getContentProjectionOptions(renderCache))
            );
            await this.copyContentsToSite(siteStorageDir, contents);
            const postObject = {
                id: gp.localId,
                lang: options.lang,
                contents,
                group: gp.group ? pick(gp.group, ['name', 'title', 'manifestStorageId', 'manifestStaticStorageId', 'propertiesJson']) : null,
                replyTo: null,
                repostOf: null,
                date: gp.publishedAt.getTime(),
                ...getPostTitleAndDescription(gp, contents, options.post)
            };
            if (gp.id) {
                setCachedPostObject(renderCache, gp.id, postObject);
            }
            postObject.replyTo = await this.postToObj(options, siteStorageDir, gp.replyTo, renderCache);
            postObject.repostOf = await this.postToObj(options, siteStorageDir, gp.repostOf, renderCache);
            return postObject;
        }

        async copyContentsToSite(siteStorageDir, contents: IContentData[], numericNames = false) {
            const copied = {};
            await pIteration.forEach(contents, async (c: IContentData, index) => {
                if (copied[c.storageId]) {
                    return;
                }
                await app.ms.storage.nodeLs(c.storageId).then(r => {
                    // log('res fileLs', c.name, c.storageId, r);
                }).catch(e => {
                    console.error('err fileLs', c.storageId, e);
                });
                const contentPath = `${siteStorageDir}/content`;
                if(c.type !== 'text') {
                    const prefix = numericNames ? `${index + 1}_` : ``;
                    await app.ms.storage.copyFileFromId(c.storageId, `${contentPath}/${prefix}${c.storageId}.${c.extension}`).catch(e => console.warn('copyContentsToSite', e.message));
                    await app.ms.storage.copyFileFromId(c.previewStorageId, `${contentPath}/${prefix}${c.previewStorageId}.${c.previewExtension}`).catch(e => console.warn('copyContentsToSite', e.message));
                }
                copied[c.storageId] = true;
            });
        }

        async renderAndSave(renderPage, options, storageDir, path, type, p = null) {
            let pageTitle = '';
            if (type === 'simple') {
                pageTitle = `${options.site.title}`;
            } else if (type === 'main') {
                pageTitle = `${options.site.title} - Main page`;
            } else if (type === 'page') {
                pageTitle = `${options.site.title} - Page #${last(path.split('/'))}`;
            } else if (type === 'post') {
                pageTitle = `${options.site.title} - ${p && p.pageTitle ? p.pageTitle : 'Post #' + p.id}`;
            }
            const pageDescription = type === 'post' && p && p.pageDescription ? p.pageDescription : options.site.description;
            const postImages = type === 'post' && p ? p.contents.filter(c => c.type === 'image') : [];
            const imageUrl = postImages.length ? postImages[0].url : options.site.avatarUrl;

            const headers = getOgHeaders(options.site.title, options.lang, pageTitle, pageDescription, imageUrl);
            const htmlContent = await renderPage(path || '/', headers);
            const {id: storageId} = await app.ms.storage.saveFile(htmlContent);
            if (type !== 'simple') {
                storageDir += path;
            }
            return app.ms.storage.copyFileFromId(storageId, `${storageDir}/index.html`);
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
            log('entityType', entityType, 'entityId', entityId, 'name', name);
            let staticId;
            if (entityType === 'group') {
                staticId = await app.ms.staticId.getOrCreateStaticGroupAccountId(userId, entityId, name);
                if (staticSite.storageId) {
                    await app.ms.staticId.bindToStaticIdByGroup(userId, entityId, staticSite.storageId, staticId);
                }
            } else {
                staticId = await app.ms.staticId.getOrCreateStaticAccountId(userId, name);
                if (staticSite.storageId) {
                    await app.ms.staticId.bindToStaticId(userId, staticSite.storageId, staticId);
                }
            }
            return this.updateDbStaticSite(staticSite.id, {staticId, storageId: staticSite.storageId, name});
        }

        async getStaticSiteInfo(userId, renderArgs: IStaticSiteRenderArgs) {
            let {entityType, entityId, entityIds} = renderArgs;
            if (entityIds) {
                entityId = this.entityIdsToKey(entityIds);
            }
            const where: any = {entityType, entityId: entityId.toString()};
            if (entityType === 'group') {
                if(!(await app.ms.group.canEditGroup(userId, entityId))) {
                    throw new Error("not_permitted");
                }
            } else {
                where.userId = userId;
            }

            return models.StaticSite.findOne({ where }) as IStaticSite;
        }

        async getStaticSiteList(userId: number, entityType?: string, listParams: IListParams = {}) {
            app.ms.database.setDefaultListParamsValues(listParams, staticSiteListParams);

            const where: any = {userId};
            if (entityType) {
                where['entityType'] = entityType;
            }
            const {sortBy, sortDir, limit, offset} = listParams;
            return models.StaticSite.findAll({ where, limit, offset, order: [[sortBy, sortDir.toUpperCase()]]}) as IStaticSite[];
        }

        async getStaticSiteCount(userId: number, entityType?: string, listParams: IListParams = {}) {
            const where: any = {userId};
            if (entityType) {
                where['entityType'] = entityType;
            }
            return models.StaticSite.count({ where });
        }

        async getStaticSiteResponse(userId: number, entityType?: string, listParams: IListParams = {}) {
            listParams = helpers.prepareListParams(listParams, staticSiteListParams);

            return {
                list: await this.getStaticSiteList(userId, entityType, listParams),
                total: await this.getStaticSiteCount(userId, entityType)
            }
        }

        isAutoActionAllowed(userId, funcName, funcArgs) {
            return ['addRenderToQueueAndProcess', 'runRenderAndWaitForFinish', 'bindSiteToStaticId'].includes(funcName);
        }

        async updateStaticSiteInfo(userId, staticSiteId, updateData) {
            const staticSiteInfo = await models.StaticSite.findOne({ where: {id: staticSiteId}}) as IStaticSite;
            if (!staticSiteInfo) {
                throw new Error("static_site_not_found");
            }
            updateData = prepareStaticSiteUpdateData(updateData);
            const {entityType, entityId, name} = staticSiteInfo;
            if (name && updateData['name'] && updateData['name'] !== name) {
                if (entityType === 'group') {
                    await app.ms.staticId.renameGroupStaticAccountId(userId, entityId, name, updateData['name']);
                } else {
                    await app.ms.staticId.renameStaticAccountId(userId, name, updateData['name']);
                }
            }
            return this.updateDbStaticSite(staticSiteInfo.id, updateData);
        }

        async flushDatabase() {
            await pIteration.forEachSeries(['StaticSite'], (modelName) => {
                return models[modelName].destroy({where: {}});
            });
        }
    }

    return new StaticSiteGenerator();
}
