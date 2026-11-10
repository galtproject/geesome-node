import {statfs} from 'node:fs/promises';

// Network availability signals measure replicas, not free space. An operator
// must identify the filesystem actually backing Kubo, not the app's overlay.
export async function cleanupDiskPressure(env = process.env, read = statfs) {
    const path = env.STORAGE_CLEANUP_DATA_PATH;
    const minimum = Number(env.STORAGE_CLEANUP_MIN_FREE_BYTES || 5 * 1024 ** 3);
    if (!path || !Number.isSafeInteger(minimum) || minimum < 1 || minimum > 1024 ** 4) {
        return false;
    }
    try {
        const stats = await read(path);
        return stats.bavail * stats.bsize < minimum;
    } catch {
        return false; // An unknown mount must not force a disruptive GC.
    }
}
