import os from "os";
import fs from "fs";
import path from "path";
import debug from "debug";
import helpers from "./helpers.js";

const memoryLog = debug('geesome:memory');

let filePath: string | undefined;

function toMb(bytes: number) {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function isProfilingEnabled() {
  return memoryLog.enabled || !!filePath;
}

function takeMemorySnapshot(label?: string, extra?: any) {
  const mem = process.memoryUsage();
  return {
    time: new Date().toISOString(),
    ...(label ? {label} : {}),
    rssMb: toMb(mem.rss),
    heapUsedMb: toMb(mem.heapUsed),
    heapTotalMb: toMb(mem.heapTotal),
    externalMb: toMb(mem.external),
    arrayBuffersMb: toMb(mem.arrayBuffers),
    systemTotalMb: toMb(os.totalmem()),
    systemFreeMb: toMb(os.freemem()),
    uptimeSec: Math.round(process.uptime()),
    ...(extra || {}),
  };
}

function writeSnapshot(snapshot: any) {
  helpers.logDebug(memoryLog, () => ['snapshot', snapshot]);
  if (filePath) {
    fs.appendFile(filePath, JSON.stringify(snapshot) + '\n', (e) => {
      if (e) {
        console.error('memory_log_file_write_error', e.message);
      }
    });
  }
}

// Record a one-off labeled snapshot around an event of interest (e.g. video
// transcoding). No-op unless profiling is enabled. Native/child-process memory
// (ffmpeg) shows up in externalMb/systemFreeMb rather than rss.
export function recordMemorySnapshot(label?: string, extra?: any) {
  if (!isProfilingEnabled()) {
    return;
  }
  writeSnapshot(takeMemorySnapshot(label, extra));
}

// Periodically profile process and system memory so real-world footprint can be
// measured to size hardware requirements. Writes one JSON object per line to
// GEESOME_MEMORY_LOG_FILE (if set) and/or emits on the geesome:memory debug
// namespace. Interval in seconds via GEESOME_MEMORY_LOGS_INTERVAL (default 60).
export function startMemoryProfiler() {
  filePath = process.env.GEESOME_MEMORY_LOG_FILE || undefined;
  if (!isProfilingEnabled()) {
    return;
  }
  if (filePath) {
    try {
      fs.mkdirSync(path.dirname(filePath), {recursive: true});
    } catch (e) {
      console.error('memory_log_file_dir_error', e.message);
    }
  }
  const intervalSec = Number.parseInt(process.env.GEESOME_MEMORY_LOGS_INTERVAL || '', 10);
  const intervalMs = (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : 60) * 1000;
  recordMemorySnapshot();
  const timer = setInterval(() => recordMemorySnapshot(), intervalMs);
  timer.unref();
}
