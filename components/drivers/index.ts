import {ImagePreviewDriver} from "./preview/image";
import {TextPreviewDriver} from "./preview/text";
import {YoutubeVideoUploadDriver} from "./upload/youtube-video";
import {YoutubeThumbnailPreviewDriver} from "./preview/youtube-thumbnail";

module.exports = {
    preview: {
        image: new ImagePreviewDriver(),
        text: new TextPreviewDriver(),
        'youtube-thumbnail': new YoutubeThumbnailPreviewDriver()
    },
    upload: {
        'youtube-video': new YoutubeVideoUploadDriver()
    }
};
