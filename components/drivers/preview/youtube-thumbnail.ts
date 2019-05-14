import {DriverInput, IDriver} from "../interface";

import {Stream} from "stream";

const youtubedl = require('youtube-dl');

export class YoutubeThumbnailPreviewDriver implements IDriver{
    supportedInputs = [DriverInput.Source];

    async processBySource(url, options: any = {}) {
        return new Promise((resolve, reject) => {
            youtubedl.getThumbs(url, {
                // Downloads available thumbnail.
                all: false,
                // The directory to save the downloaded files in.
                cwd: '/tmp/',
            }, function(err, files) {
                if (err) 
                    throw err;
                console.log('thumbnail file downloaded:', files);
                resolve({
                    path: '/tmp/' + files[0],
                    type: 'image/jpg'
                })
            });
        })
    }
}
