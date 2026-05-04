/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs/promises";
import {execFile, spawn} from "child_process";
import os from "os";
import path from "path";
import {Readable} from "stream";
import {v4 as uuidv4} from "uuid";

function getYtDlpBinary() {
  return process.env.YT_DLP_BINARY || "yt-dlp";
}

export async function getYoutubeInfo(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    execFile(getYtDlpBinary(), ["--dump-single-json", "--no-playlist", url], {maxBuffer: 50 * 1024 * 1024}, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve(JSON.parse(stdout));
    });
  });
}

export function streamYoutubeFormat(url: string, formatId: string): Readable {
  const ytDlpProcess = spawn(getYtDlpBinary(), [
    url,
    "--format",
    formatId,
    "--no-playlist",
    "--output",
    "-",
  ]);

  ytDlpProcess.on("error", error => ytDlpProcess.stdout.emit("error", error));
  return ytDlpProcess.stdout;
}

function extensionByContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function downloadYoutubeThumbnail(url: string) {
  const info = await getYoutubeInfo(url);
  const thumbnails = Array.isArray(info.thumbnails) ? info.thumbnails : [];
  const bestThumbnail = thumbnails
    .filter(t => t && t.url)
    .sort((a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0))[0];

  const thumbnailUrl = bestThumbnail?.url || info.thumbnail;
  if (!thumbnailUrl) {
    throw new Error("youtube_thumbnail_not_found");
  }

  const response = await fetch(thumbnailUrl);
  if (!response.ok) {
    throw new Error(`youtube_thumbnail_download_failed_${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  const extension = extensionByContentType(contentType);
  const tempPath = path.join(os.tmpdir(), `geesome-youtube-thumbnail-${uuidv4()}.${extension}`);
  const data = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(tempPath, data);

  return {
    path: tempPath,
    type: contentType,
    extension,
  };
}
