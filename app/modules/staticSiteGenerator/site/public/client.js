import CreatorApp from './creator/App.vue';
import { createApp } from './index.js';
const clientData = JSON.parse(document.querySelector('script#site-data[type="application/json"]').textContent);

createApp(clientData, null, clientData.membership ? CreatorApp : null).then(({app}) => {
    app.mount('#app');
});

console.log(`
🦈
🦈 🦈
🦈 🦈 🦈
👋 Developer? Check out examples in https://github.com/galtproject/geesome-node repo tests and check/geesomeClientStaticSite.ts script.

⭐️ Don't forget to put a star to repo!
🦈 🦈 🦈
🦈 🦈
🦈
`);
