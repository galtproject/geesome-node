const {createPage} = require('@vuepress/core');

const _ = require('lodash');
const markdown = require('markdown-it');

module.exports = function(posts, settings) {
    let app, postPages, intervallers;

    const {post: postSettings, postList: postListSettings, dateFormat, site} = settings;

    return {
        async onInitialized(_app) {
            app = _app;

            postPages = [];
            intervallers = getIntervallers(posts.length, postListSettings.postsPerPage);
            console.log('getIntervallers', posts.length, postListSettings.postsPerPage);
            console.log('intervallers', intervallers);

            for (let i = 0; i < posts.length; i++) {
                const post = posts[i];

                const {title, description} = getTitleAndDescription(post.content, postSettings);

                const page = await createPage(app, {
                    path: getPostPath(post.id),
                    frontmatter: {
                        layout: 'Post',
                        permalink: getPostPath(post.id),
                        // permalinkPattern?: string;
                        head: [],
                        title,
                        description,
                        date: post.date,
                        ..._.pick(post, ['lang', 'id', 'images', 'videos'])
                    },
                    content: post.content,
                });

                app.pages.push(page);
                postPages.push(page);
            }

            for (let i = 1; i <= intervallers.length; i++) {
                const page = await createPage(app, {
                    path: getPaginationPostPath(i),
                    frontmatter: {
                        layout: 'BaseList',
                        permalink: getPaginationPostPath(i),
                    },
                    title: 'Page ' + i,
                    content: 'Page ' + i,
                });

                app.pages.push(page);
            }

            app.pages.push(await createPage(app, {
                path: '/',
                frontmatter: {
                    layout: 'BaseList',
                    permalink: '/',
                    home: true,
                },
                title: 'Home',
                content: 'Welcome',
            }));

            app.pages.push(await createPage(app, {
                path: '/404.html',
                frontmatter: {
                    layout: '404',
                    permalink: '/404',
                },
                title: '404',
                content: '404',
            }));
        },
        extendsPage(page) {
            console.log('page.permalink', page.permalink);
            page.data.$themeConfig = {
                dateFormat,
                nav: [
                    {text: 'Blog', link: site.base}
                ]
            };
            page.data.$site = site;
            if (page.permalink === null) {
                return;
            }
            const splitLink = _.trim(page.permalink, '/').split('/');
            if (page.frontmatter.layout === 'BaseList') {
                const pageNumber = parseInt(splitLink[splitLink.length - 1]);
                const interval = page.frontmatter.home ? intervallers[0] : intervallers[pageNumber - 1];

                page.data.$pagesList = postPages.slice(interval[0] - 1, interval[1]).map(page => ({
                    key: page.key,
                    path: page.permalink,
                    date: page.frontmatter.date,
                    title: page.frontmatter.title,
                    excerpt: page.frontmatter.description,
                    images: page.frontmatter.images,
                    videos: page.frontmatter.videos
                }));
                page.data.$pagination = {
                    pages: intervallers.map((interval, i) => {
                        const page = i + 1;
                        const baseHref = '/posts/page/';
                        return {
                            page,
                            baseHref,
                            path: baseHref + page
                        }
                    })
                };
            } else if (page.frontmatter.layout === 'Post') {
                return;
            }
            return;
        }
    };
};

function getIntervallers(max, interval) {
    const count =
        max % interval === 0
            ? Math.floor(max / interval)
            : Math.floor(max / interval) + 1;
    const arr = [...new Array(count)];
    return arr.map((_, index) => {
        const start = index * interval + 1;
        const end = (index + 1) * interval;
        return [start, end > max ? max : end];
    });
}

function getPostPath(postId) {
    return '/posts/' + postId + '/';
}
function getPaginationPostPath(pageNumber) {
    return '/posts/page/' + pageNumber + '/';
}

function getTitleAndDescription(content, postSettings) {
    const {titleLength, descriptionLength} = postSettings;
    let title = content.split('\n')[0];
    let description = '';
    let dotsAdded = false;
    if (title.length > titleLength) {
        title = title.slice(0, titleLength) + '...';
        dotsAdded = true;
        description = '...' + title.slice(titleLength, titleLength + descriptionLength);
    } else if (content.split('\n')[1]) {
        description = _.trimStart(content.split('\n')[1], '#').slice(descriptionLength);
        if (description.length + title.length < content.length) {
            description += '...';
        }
    }
    if (content.length > title.length && !dotsAdded) {
        title += '...';
    }
    return {title, description};
}