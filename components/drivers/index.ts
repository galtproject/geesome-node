/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ImagePreviewDriver} from "./preview/image";
import {TextPreviewDriver} from "./preview/text";
import {YoutubeVideoUploadDriver} from "./upload/youtube-video";
import {YoutubeThumbnailPreviewDriver} from "./preview/youtube-thumbnail";
import {VideoToStreambleDriver} from "./convert/video-to-streamable";
import {VideoThumbnail} from "./preview/video-thumbnail";
import {ArchiveUploadDriver} from "./upload/archive";
import {ImageMetadataDriver} from "./metadata/image";
import {FileUploadDriver} from "./upload/file";
import {GifPreviewDriver} from "./preview/gif";

module.exports = {
  preview: {
    image: new ImagePreviewDriver(),
    gif: new GifPreviewDriver(),
    text: new TextPreviewDriver(),
    'youtube-thumbnail': new YoutubeThumbnailPreviewDriver(),
    'video-thumbnail': new VideoThumbnail()
  },
  metadata: {
    image: new ImageMetadataDriver()
  },
  upload: {
    'youtube-video': new YoutubeVideoUploadDriver(),
    'archive': new ArchiveUploadDriver(),
    'file': new FileUploadDriver()
  },
  convert: {
    'video-to-streamable': new VideoToStreambleDriver()
  }
};
