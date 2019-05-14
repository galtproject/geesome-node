import {DriverInput, IDriver} from "../interface";

import {Stream} from "stream";

const youtubedl = require('youtube-dl');
const fs = require('fs');
const _ = require('lodash');

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
                    path: decodeURIComponent('/tmp/' + files[0]),
                    type: 'image/jpg'
                })
                // const oldPath = decodeURIComponent('/tmp/' + files[0]);
                // const newPath = '/tmp/' + _.last(url.split('/'));
                // fs.rename(oldPath, newPath, (err) => {
                //     if (err) throw err;
                //     resolve({
                //         path: newPath,
                //         type: 'image/jpg'
                //     })
                // });
                
            });
        })
    }
}
