import { createApp } from './index.js';
import clientData from 'clientData';

createApp(clientData).then(({app}) => {
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
