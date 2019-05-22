import {DriverInput, IDriver} from "../interface";

import {Stream} from "stream";

const youtubedl = require('youtube-dl');

export class YoutubeVideoUploadDriver implements IDriver{
    supportedInputs = [DriverInput.Source];

    async processBySource(url, options: any = {}) {
        const stream = youtubedl(url,
            // Optional arguments passed to youtube-dl.
            ['--format=18'],
            // Additional options can be given for calling `child_process.execFile()`.
            { cwd: __dirname });
        return {
            stream,
            type: 'video/mp4',
            extension: 'mp4'
        }
    }
}
