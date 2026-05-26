import { createApp } from './index.js';
import clientData from 'clientData';

createApp(clientData).then(({app}) => {
    app.mount('#app');
});
