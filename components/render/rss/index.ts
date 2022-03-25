import {IGeesomeApp} from "../../app/interface";
import {IPost} from "../../database/interface";

const xml = require('xml');
const pIteration = require('p-iteration');
const _ = require('lodash');

module.exports = async (app: IGeesomeApp) => {
    return new RssGenerator(app);
}

class RssGenerator {
    app: IGeesomeApp;
    moduleName = 'rss';

    constructor(_app: IGeesomeApp) {
        this.app = _app;
        _app.api.get(this.getRssGroupUrl(), async (req, res) => {
            const host = req.rawHeaders[req.rawHeaders.indexOf('Host') + 1];
            console.log('req', req);
            return res.send(await this.groupRss(_.last(req.originalUrl.split('/')).split('.')[0], host), 200);
        });
    }

    getRssGroupUrl(groupId?) {
        const groupUrl = `/v1/render/${this.moduleName}/group/:id.rss`;
        return groupId ? groupUrl.replace(':id', groupId) : groupUrl;
    }

    async groupRss(groupId, host) {
        console.log('groupId', groupId);
        const group = await this.app.getGroup(groupId);
        const {list: groupPosts} = await this.app.getGroupPosts(groupId, {}, {sortBy: 'publishedAt', sortDir: 'desc', limit: 9999, offset: 0});

        const feedObject = {
            rss: [
                { _attr: { version: "2.0", "xmlns:atom": "http://www.w3.org/2005/Atom"} },
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
                        { title: group.title },
                        { link: group.homePage },
                        { description: group.description },
                        { language: "en-US" },
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
                return this.app.getPostContent(host + '/v1/content-data/', post).then(({text, images, videos}) => {
                    return {
                        item: [
                            { title: text.slice(0, 50) + (text.length > 50 ? '...' : '')  },
                            { pubDate: new Date(post.publishedAt).toUTCString() },
                            { guid: [ { _attr: { isPermaLink: true } }, `${homePage}/posts/${post.localId}/` ] },
                            { description: { _cdata: text + images.map(src => `<div><img src="${src.url}" style="max-width: 100%;"></div>`) } },
                        ],
                    }
                });
            })
        }).then(chunks => _.flatten(chunks));
    }
}