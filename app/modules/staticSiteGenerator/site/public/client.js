import { createApp } from './index.js';
import clientData from 'clientData';
// import Notifications from '@kyvg/vue3-notification';

createApp(clientData).then(({app}) => {
    app.mount('#app'); // .use(Notifications)
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