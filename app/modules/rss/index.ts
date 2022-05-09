import {IGeesomeApp} from "../../interface";
import {IPost} from "../database/interface";

const xml = require('xml');
const pIteration = require('p-iteration');
const _ = require('lodash');

module.exports = (app: IGeesomeApp) => {
    const module = getModule(app);
    require('./api')(app, module);
    return module;
}

function getModule(app: IGeesomeApp) {
    app.checkModules(['group']);

    class RssGenerator {
        moduleName = 'rss';

        getRssGroupUrl(groupId?) {
            const groupUrl = `render/${this.moduleName}/group/:id.rss`;
            return groupId ? groupUrl.replace(':id', groupId) : groupUrl;
        }

        async groupRss(groupId, host, forUserId?) {
            console.log('groupId', groupId);
            const group = await app.ms.group.getGroup(groupId);
            // TODO: check permission to read not public groups by user id
            if (!forUserId && !group.isPublic) {
                throw new Error('group_not_public');
            }
            const {list: groupPosts} = await app.ms.group.getGroupPosts(groupId, {}, {
                sortBy: 'publishedAt',
                sortDir: 'desc',
                limit: 9999,
                offset: 0
            });

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

        async buildFeed(
            homePage,
            host,
            posts: IPost[]
        ) {
            return pIteration.mapSeries(_.chunk(posts, 10), (postsChunk) => {
                return pIteration.map(postsChunk, post => {
                    return app.ms.group.getPostContent(host + '/v1/content-data/', post).then((contents) => {
                        console.log('contents', contents);
                        let text = (_.find(contents, (c) => c.type === 'text' && c.view === 'contents') || {}).text;
                        if (!text) {
                            text = (_.find(contents, (c) => c.type === 'text') || {}).text;;
                        }
                        const images = _.filter(contents, (c) => c.type === 'image');
                        return {
                            item: [
                                {title: text.slice(0, 50) + (text.length > 50 ? '...' : '')},
                                {pubDate: new Date(post.publishedAt).toUTCString()},
                                {guid: [{_attr: {isPermaLink: true}}, `${homePage}/posts/${post.localId}/`]},
                                {description: {_cdata: text + images.map(src => `<div><img src="${src.url}" style="max-width: 100%;"></div>`)}},
                            ],
                        }
                    });
                })
            }).then(chunks => _.flatten(chunks));
        }
    }
    return new RssGenerator();
}