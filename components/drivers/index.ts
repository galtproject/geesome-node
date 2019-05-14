
module.exports = {
    preview: {
        image: new (require('./preview/image') as any),
        text: new (require('./preview/text') as any)
    },
    upload: {
        youtube: new (require('./upload/youtube') as any)
    }
};
