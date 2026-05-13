import _ from 'lodash';
import pIteration from 'p-iteration';
import {IGeesomeApp} from "../../interface.js";
import {ContentView} from "../database/interface.js";
import {IPost} from "../group/interface.js";
const {chunk, find, filter, flatten} = _;
const rssPostsLimit = 9999;
const rssPostBatchLimit = 100;

export default async (app: IGeesomeApp) => {
    const xml = await import('xml');
    const module = getModule(app, xml.default);
    (await import('./api.js')).default(app, module);
    return module;
}

function getModule(app: IGeesomeApp, xml) {
    app.checkModules(['group']);

    class RssGenerator {
        moduleName = 'rss';

        getRssGroupUrl(groupId?) {
            const groupUrl = `render/${this.moduleName}/group/:id.rss`;
            return groupId ? groupUrl.replace(':id', groupId) : groupUrl;
        }

        async groupRss(groupId, host, forUserId?) {
            const group = await app.ms.group.getLocalGroup(null, groupId);
            // TODO: check permission to read not public groups by user id
            if (!forUserId && !group.isPublic) {
                throw new Error('group_not_public');
            }
            const groupPosts = await this.getGroupPostsForFeed(groupId);

            const feedObject = {
                rss: [
                    {_attr: {version: "2.0", "xmlns:atom": "http://www.w3.org/2005/Atom"}},
                    {
                        channel: [
                            {
                                "atom:link": {
                                    _attr: {
                                        href: host + this.getRssGroupUrl(groupId),
                                        rel: "self",
                                        type: "application/rss+xml",
                                    },
                                },
                            },
                            {title: group.title},
                            {link: group.homePage},
                            {description: group.description},
                            {language: "en-US"},
                            ...(await this.buildFeed(group.homePage, host, groupPosts)),
                        ],
                    },
                ],
            };

            return '<?xml version="1.0" encoding="UTF-8"?>' + xml(feedObject);
        }

        getPostFeedText(contents) {
            return (find(contents, (c) => c.type === 'text' && c.view === 'contents') || {}).text
                || (find(contents, (c) => c.type === 'text') || {}).text
                || '';
        }

        getPostFeedTextContent(post: IPost) {
            const contents = post.contents || [];
            const contentsViewText = find(contents, (content) => {
                return content.mimeType?.startsWith('text/')
                    && (content.postsContents?.view || content.view || ContentView.Contents) === ContentView.Contents;
            });
            if (contentsViewText) {
                return contentsViewText;
            }
            return find(contents, (content) => {
                return content.mimeType?.startsWith('text/');
            });
        }

        async getPostFeedContents(post: IPost, baseStorageUri: string) {
            const contents = await app.ms.group.getPostContentDataWithUrl(post, baseStorageUri, {
                includeText: false,
                includeJson: false
            });
            const textContent = this.getPostFeedTextContent(post);
            if (!textContent) {
                return contents;
            }

            const hydratedTextContent = await app.ms.group.prepareContentDataWithUrl(textContent, baseStorageUri, {
                includeJson: false
            });
            return contents.map(content => {
                if (content.id !== hydratedTextContent.id) {
                    return content;
                }
                return hydratedTextContent;
            });
        }

        async postToFeedItem(homePage, host, post) {
            const contents = await this.getPostFeedContents(post, host + '/ipfs/');
            const text = this.getPostFeedText(contents);
            const images = filter(contents, (c) => c.type === 'image');
            return {
                item: [
                    {title: text.slice(0, 50) + (text.length > 50 ? '...' : '')},
                    {pubDate: new Date(post.publishedAt).toUTCString()},
                    {guid: [{_attr: {isPermaLink: true}}, `${homePage}/posts/${post.localId}/`]},
                    {description: {_cdata: text + images.map(src => `<div><img src="${src.url}" style="max-width: 100%;"></div>`)}},
                ],
            }
        }

        async buildFeed(
            homePage,
            host,
            posts: IPost[]
        ) {
            return pIteration.mapSeries(chunk(posts, 10), (postsChunk) => {
                return pIteration.map(postsChunk, post => this.postToFeedItem(homePage, host, post));
            }).then(chunks => flatten(chunks));
        }

        async getGroupPostsForFeed(groupId) {
            const feedPosts = [];
            await app.ms.group.forEachHydratedGroupPostBatch(groupId, {
                maxRefs: rssPostsLimit,
                batchLimit: rssPostBatchLimit,
                listParams: {
                    sortBy: 'publishedAt',
                    sortDir: 'desc'
                }
            }, async ({groupPosts}) => {
                feedPosts.push(...groupPosts);
            });
            return feedPosts;
        }
    }
    return new RssGenerator();
}
