import {DriverInput, IDriver} from "../interface";

// import {Stream} from "stream";

const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const uuidv1 = require('uuid/v1');

export class VideoToStreambleDriver implements IDriver {
  supportedInputs = [DriverInput.Stream];

  async processByStream(stream, options: any = {}) {
    // console.log('stream', stream);

    const path = `/tmp/` + uuidv1() + '.' + options.extension;

    /*
    //TODO: solve error
    An error occurred: ffmpeg exited with code 1: /tmp/0a2015d0-7bb6-11e9-b07f-eb8d3058136f.mp4: Invalid data found when processing input
     Error: ffmpeg exited with code 1: /tmp/0a2015d0-7bb6-11e9-b07f-eb8d3058136f.mp4: Invalid data found when processing input
    
        at ChildProcess.<anonymous> (/Users/jonybang/workspace/geesome-core/node_modules/fluent-ffmpeg/lib/processor.js:182:22)
        at ChildProcess.emit (events.js:189:13)
        at ChildProcess.EventEmitter.emit (domain.js:441:20)
        at Process.ChildProcess._handle.onexit (internal/child_process.js:248:12) ffmpeg version 4.1 Copyright (c) 2000-2018 the FFmpeg developers
      built with Apple LLVM version 10.0.0 (clang-1000.11.45.5)
      configuration: --prefix=/usr/local/Cellar/ffmpeg/4.1_2 --enable-shared --enable-pthreads --enable-version3 --enable-hardcoded-tables --enable-avresample --cc=clang --host-cflags= --host-ldflags= --enable-ffplay --enable-gpl --enable-libmp3lame --enable-libopus --enable-libsnappy --enable-libtheora --enable-libvorbis --enable-libvpx --enable-libx264 --enable-libx265 --enable-libxvid --enable-lzma --enable-libfreetype --enable-frei0r --enable-libass --enable-libopencore-amrnb --enable-libopencore-amrwb --enable-librtmp --enable-libspeex --enable-videotoolbox
      libavutil      56. 22.100 / 56. 22.100
      libavcodec     58. 35.100 / 58. 35.100
      libavformat    58. 20.100 / 58. 20.100
      libavdevice    58.  5.100 / 58.  5.100
      libavfilter     7. 40.101 /  7. 40.101
      libavresample   4.  0.  0 /  4.  0.  0
      libswscale      5.  3.100 /  5.  3.100
      libswresample   3.  3.100 /  3.  3.100
      libpostproc    55.  3.100 / 55.  3.100
    /tmp/0a2015d0-7bb6-11e9-b07f-eb8d3058136f.mp4: Invalid data found when processing input

     */
    await new Promise((resolve, reject) =>
      stream
        .on('error', error => {
          if (stream.truncated)
          // delete the truncated file
            fs.unlinkSync(path);
          reject(error);
        })
        .pipe(fs.createWriteStream(path))
        .on('error', error => reject(error))
        .on('finish', () => resolve({path}))
    );

    const command = new ffmpeg(path)
      .inputFormat(options.extension)
      .inputOptions([
        '-hls_time 5',
        '-hls_list_size 0',
        '-f hls'
      ])
      .on('error', function (err, stdout, stderr) {
        console.log('An error occurred: ' + err.message, err, stderr);
      })
      .output('m3u8');

    //
    return {
      stream: command.pipe(),
      type: 'application/vnd.apple.mpegurl'
    }
  }
}
