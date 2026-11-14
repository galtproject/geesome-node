/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import fs from "fs/promises";
import {execFile} from "child_process";
import {promisify} from "node:util";
import axios from "axios";
import {createSafeHttpAndHttpsAgents} from "../../helpers/safeHttpsAgent.js";
import {createYoutubeProxy} from "./youtubeProxy.js";
import os from "os";
import path from "path";
import {v4 as uuidv4} from "uuid";

function getYtDlpBinary() {
  return process.env.YT_DLP_BINARY || "yt-dlp";
}

const execute = promisify(execFile);
const youtubeHosts = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function normalizeYoutubeUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error('youtube_source_not_allowed');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !youtubeHosts.has(url.hostname)) {
    throw new Error('youtube_source_not_allowed');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  const id = url.hostname === 'youtu.be' && parts.length === 1 ? parts[0]
    : url.pathname === '/watch' ? url.searchParams.get('v')
    : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) && parts.length === 2 ? parts[1] : null;
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    throw new Error('youtube_source_not_allowed');
  }
  return `https://www.youtube.com/watch?v=${id}`;
}

export async function getYoutubeInfo(source: string): Promise<any> {
  const url = normalizeYoutubeUrl(source);
  const proxy = await createYoutubeProxy();
  try {
    // Config files, generic extractors, and plugins must not introduce a second
    // download path. Explicit proxy environment also prevents NO_PROXY bypasses.
    const {stdout} = await execute(getYtDlpBinary(), [
      '--ignore-config', '--no-plugin-dirs', '--use-extractors', '^youtube$',
      '--proxy', proxy.url, '--socket-timeout', '30',
      '--dump-single-json', '--simulate', '--no-playlist', '--', url
    ], {
      encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 120000, killSignal: 'SIGKILL',
      env: {...process.env, HTTP_PROXY: proxy.url, HTTPS_PROXY: proxy.url, ALL_PROXY: proxy.url,
        http_proxy: proxy.url, https_proxy: proxy.url, all_proxy: proxy.url, NO_PROXY: '', no_proxy: ''}
    });
    return JSON.parse(stdout);
  } finally {
    await proxy.close();
  }
}

export async function streamYoutubeFormat(source: string, formatId: string, videoInfo?: any) {
  normalizeYoutubeUrl(source);
  const info = videoInfo || await getYoutubeInfo(source);
  const format = info.formats?.find(format => format.format_id === formatId);
  // Do not hand manifests or secondary downloads to ffmpeg/yt-dlp. A direct
  // HTTP(S) format is streamed through the same pinned policy as URL uploads.
  if (!format || !['http', 'https'].includes(format.protocol)) {
    throw new Error('youtube_direct_format_required');
  }
  const response = await downloadPublicMedia(format.url, 'stream', format.http_headers || info.http_headers);
  return response.data;
}

async function downloadPublicMedia(source: string, responseType: 'stream' | 'arraybuffer', sourceHeaders: Record<string, string> = {}) {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('youtube_media_source_not_allowed');
  }
  const agents = await createSafeHttpAndHttpsAgents(url.hostname, {errorPrefix: 'youtube_media'});
  const dispose = () => {
    agents.httpAgent.destroy();
    agents.httpsAgent.destroy();
  };
  const headers = Object.fromEntries(Object.entries(sourceHeaders || {}).filter(([name, value]) =>
    typeof value === 'string' && ['user-agent', 'referer', 'origin', 'accept', 'accept-language'].includes(name.toLowerCase())));
  try {
    const response = await axios({url: url.href, method: 'get', responseType, ...agents,
      headers, proxy: false, maxRedirects: 0, timeout: 30000,
      maxContentLength: responseType === 'arraybuffer' ? 20 * 1024 * 1024 : -1,
      validateStatus: status => status === 200});
    if (responseType === 'stream') {
      response.data.once('end', dispose);
      response.data.once('close', dispose);
      response.data.once('error', dispose);
    } else {
      dispose();
    }
    return response;
  } catch (error) {
    error.response?.data?.destroy?.();
    dispose();
    throw error;
  }
}

function extensionByContentType(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
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

  const response = await downloadPublicMedia(thumbnailUrl, 'arraybuffer');
  const contentType = String(response.headers['content-type'] || 'image/jpeg');
  const extension = extensionByContentType(contentType);
  const tempPath = path.join(os.tmpdir(), `geesome-youtube-thumbnail-${uuidv4()}.${extension}`);
  const data = Buffer.from(response.data);
  await fs.writeFile(tempPath, data);

  return {
    path: tempPath,
    type: contentType,
    extension,
  };
}
