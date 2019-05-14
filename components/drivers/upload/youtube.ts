import {DriverInput, IDriver} from "../interface";

import {Stream} from "stream";

const youtubedl = require('youtube-dl');

export class YoutubeUploadDriver implements IDriver{
    supportedInputs = [DriverInput.Content];

    async processByContent(url, options: any = {}) {
        const stream = youtubedl(url,
            // Optional arguments passed to youtube-dl.
            ['--format=18'],
            // Additional options can be given for calling `child_process.execFile()`.
            { cwd: __dirname });
        return {
            stream,
            type: 'video/mp4'
        }
    }
}
