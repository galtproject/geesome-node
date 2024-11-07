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
import {YoutubeVideoUploadDriver} from "./upload/youtubeVideo";
import {YoutubeThumbnailPreviewDriver} from "./preview/youtubeThumbnail";
import {VideoToStreambleDriver} from "./convert/videoToStreamable";
import {VideoThumbnail} from "./preview/videoThumbnail";
import {ArchiveUploadDriver} from "./upload/archive";
import {ImageMetadataDriver} from "./metadata/image";
import {FileUploadDriver} from "./upload/file";
import {GifPreviewDriver} from "./preview/gif";
import IGeesomeDriversModule from "./interface";

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
  }
} as IGeesomeDriversModule);
