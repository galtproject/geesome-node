const { path } = require('@vuepress/utils');
const fs = require('fs');

(async () => {
    const config = require(path.resolve(__dirname, 'childProcessData.json'));
    await require('./build')(config);
})().catch(e => {
    fs.writeFileSync(path.resolve(__dirname, './error.log'), JSON.stringify(e.stack), {encoding: 'utf8'});
    throw e;
});