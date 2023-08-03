import { createApp } from './index.js';
import clientData from 'clientData';
import Notifications from '@kyvg/vue3-notification';

createApp(clientData).then(app => {
    app.use(Notifications).mount('#app')
})