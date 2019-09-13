/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ImagePreviewDriver} from "./preview/image";
import {TextPreviewDriver} from "./preview/text";
import {YoutubeVideoUploadDriver} from "./upload/youtube-video";
import {YoutubeThumbnailPreviewDriver} from "./preview/youtube-thumbnail";
import {VideoToStreambleDriver} from "./convert/video-to-streamable";
import {VideoThumbnail} from "./preview/video-thumbnail";

module.exports = {
  preview: {
    image: new ImagePreviewDriver(),
    text: new TextPreviewDriver(),
    'youtube-thumbnail': new YoutubeThumbnailPreviewDriver(),
    'video-thumbnail': new VideoThumbnail()
  },
  upload: {
    'youtube-video': new YoutubeVideoUploadDriver()
  },
  convert: {
    'video-to-streamable': new VideoToStreambleDriver()
  }
};
