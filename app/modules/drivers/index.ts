/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {ImagePreviewDriver} from "./preview/image.js";
import {TextPreviewDriver} from "./preview/text.js";
import {YoutubeVideoUploadDriver} from "./upload/youtubeVideo.js";
import {YoutubeThumbnailPreviewDriver} from "./preview/youtubeThumbnail.js";
import {VideoToStreambleDriver} from "./convert/videoToStreamable.js";
import {VideoThumbnail} from "./preview/videoThumbnail.js";
import {ArchiveUploadDriver} from "./upload/archive.js";
import {ImageMetadataDriver} from "./metadata/image.js";
import {FileUploadDriver} from "./upload/file.js";
import {GifPreviewDriver} from "./preview/gif.js";
import IGeesomeDriversModule from "./interface.js";
import {ImageWatermarkDriver} from "./convert/imageWatermark.js";

export default () => ({
  preview: {
    image: new ImagePreviewDriver(),
    gif: new GifPreviewDriver(),
    text: new TextPreviewDriver(),
    youtubeThumbnail: new YoutubeThumbnailPreviewDriver(),
    videoThumbnail: new VideoThumbnail(),
  },
  metadata: {
    image: new ImageMetadataDriver(),
  },
  upload: {
    youtubeVideo: new YoutubeVideoUploadDriver(),
    archive: new ArchiveUploadDriver(),
    file: new FileUploadDriver(),
  },
  convert: {
    videoToStreamable: new VideoToStreambleDriver(),
    imageWatermark: new ImageWatermarkDriver(),
  }
} as IGeesomeDriversModule);
