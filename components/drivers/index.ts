import {ImagePreviewDriver} from "./preview/image";
import {TextPreviewDriver} from "./preview/text";
import {YoutubeUploadDriver} from "./upload/youtube";

module.exports = {
    preview: {
        image: new ImagePreviewDriver(),
        text: new TextPreviewDriver()
    },
    upload: {
        youtube: new YoutubeUploadDriver()
    }
};
