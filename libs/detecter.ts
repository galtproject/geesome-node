module.exports = {
    isYoutubeUrl(url) {
        const _ = require('lodash');
        return _.includes(url, 'youtube.');
    }
};
