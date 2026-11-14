import config from '../app/modules/database/config.js';
import {storageMaintenanceSession} from '../app/storageMaintenance.js';
import {stopStorageFence} from '../app/storageLifecycle.js';

const app = {ms: {database: {sequelize: {config, getDialect: () => 'postgres'}}}};
// stdout is the private host protocol, not the application's diagnostic stream.
process.env.GEESOME_STORAGE_FENCE_DIAGNOSTICS = '0';
const controller = new AbortController();
const abort = () => controller.abort();
process.once('SIGINT', abort);
process.once('SIGTERM', abort);
try {
    await storageMaintenanceSession(app, process.stdin, process.stdout, {
        drainTimeoutMs: Number(process.env.GEESOME_IPFS_DRAIN_TIMEOUT_MS || 120000),
        signal: controller.signal,
    });
} catch {
    console.error('Storage maintenance fence session failed; do not restart without a live fence.');
    process.exitCode = 1;
} finally {
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
    await stopStorageFence(app);
}
