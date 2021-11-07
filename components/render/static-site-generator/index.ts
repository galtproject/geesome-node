import {IGeesomeApp} from "../../app/interface";

const {createBuildApp} = require('@vuepress/core');
const { path } = require('@vuepress/utils');

const posts = [];
for (let i = 1; i <= 20; i++) {
    posts.push({id: i, content: '#Post title ' + i + '\n\nPost content ' + i, date: new Date('2020-01-' + (i > 9 ? i : '0' + i)), lang: 'ru'});
}

const base = '/';
const plugin = require('./plugin');
const pIteration = require('p-iteration');
const _ = require('lodash');

module.exports = async (app: IGeesomeApp) => {
    return new StaticSiteGenerator(app);
}

class StaticSiteGenerator {
    app: IGeesomeApp;

    constructor(_app: IGeesomeApp) {
        this.app = _app;
    }

    async generateContent(name, data, options = {}) {
        const group = await this.app.database.getGroup(data);
        const groupPosts = await this.app.database.getGroupPosts(data, {limit: 100, offset: 0, sortBy: 'publishedAt', sortDir: 'desc'});

        const posts = await pIteration.mapSeries(groupPosts, async (gp) => {
            let content = '';
            const textContent = _.find(gp.contents, c => c.mimeType === 'text/plain');
            if (textContent) {
                content = await this.app.storage.getFileDataText(textContent.storageId);
            }
            gp.contents.forEach((c) => {
                if (_.includes(c.mimeType, 'image')) {
                    content += '\n![An image](http://localhost:7711/v1/content-data/' + c.storageId + ')';
                }
            });
            return {
                id: gp.id, //TODO: use localId
                lang: 'ru', //TODO: get lang from group
                content,
                date: gp.createdAt
            }
        });
        const settings = {
            dateFormat: 'ddd MMM DD YYYY',
            post: {
                titleLength: 100,
                descriptionLength: 200,
            },
            postList: {
                postsPerPage: 5,
            },
            site: {
                title: group.title,
                base
            }
        };

        const staticSiteApp = createBuildApp({
            base,
            source: __dirname,
            theme: path.resolve(__dirname, './theme'),
            templateSSR: path.resolve(__dirname, './theme/index.ssr.html'),
            plugins: [plugin(posts, settings)]
        })

        // initialize and prepare
        await staticSiteApp.init();
        await staticSiteApp.prepare();

        // build
        await staticSiteApp.build();

        // process onGenerated hook
        await staticSiteApp.pluginApi.hooks.onGenerated.process(staticSiteApp);
    }
}