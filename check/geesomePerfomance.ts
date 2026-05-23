/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {performance} from 'node:perf_hooks';
import GeesomeApp from '../app/index.js';
import appConfig from '../app/config.js';
import {IGeesomeApp} from "../app/interface.js";
import {CorePermissionName} from "../app/modules/database/interface.js";

async function run() {
  const options = getPerformanceOptions();
  if (options.databaseName === 'geesome_node' && process.env.ALLOW_DEFAULT_DATABASE !== '1') {
    throw new Error('Refusing to run performance check against geesome_node without ALLOW_DEFAULT_DATABASE=1');
  }

  appConfig.storageConfig.jsNode.pass = appConfig.storageConfig.jsNode.pass || 'test test test test test test test test test test';

  let app: IGeesomeApp | null = null;
  try {
    app = await GeesomeApp({
      databaseConfig: {
        database: options.databaseName,
        logging: false
      },
      storageConfig: appConfig.storageConfig,
      port: options.port,
      skipFrontendStorage: options.skipFrontendStorage
    });

    await setupAdminIfNeeded(app);
    const testUser = await app.registerUser({
      email: `performance-save-data-${Date.now()}@example.com`,
      name: `performance-save-data-${Date.now()}`,
      permissions: [CorePermissionName.UserSaveData]
    });

    console.log(JSON.stringify({
      event: 'content-save-performance-start',
      databaseName: options.databaseName,
      iterations: options.iterations,
      payloadBytes: options.payloadBytes,
      port: options.port,
      skipFrontendStorage: options.skipFrontendStorage
    }));

    const results: any[] = [];
    for (let iteration = 0; iteration < options.iterations; iteration++) {
      const payload = Buffer.alloc(options.payloadBytes, iteration % 256);
      const startedAt = performance.now();
      const content = await app.ms.content.saveData(testUser.id, payload, options.fileName, {
        waitForPin: options.waitForPin
      });
      const durationMs = performance.now() - startedAt;
      const result = {
        iteration: iteration + 1,
        durationMs: Math.round(durationMs),
        size: content.size,
        storageId: content.storageId,
        mbPerSecond: roundMegabytesPerSecond(options.payloadBytes, durationMs)
      };
      results.push(result);
      console.log(JSON.stringify({event: 'content-save-performance-iteration', ...result}));
    }

    console.log(JSON.stringify({
      event: 'content-save-performance-summary',
      iterations: results.length,
      payloadBytes: options.payloadBytes,
      minDurationMs: Math.min(...results.map(result => result.durationMs)),
      maxDurationMs: Math.max(...results.map(result => result.durationMs)),
      avgDurationMs: Math.round(results.reduce((sum, result) => sum + result.durationMs, 0) / results.length),
      avgMbPerSecond: roundNumber(results.reduce((sum, result) => sum + result.mbPerSecond, 0) / results.length)
    }));
  } finally {
    if (app && options.flushDatabase) {
      await app.flushDatabase();
    }
    if (app) {
      await app.stop();
    }
  }
}

function getPerformanceOptions() {
  const payloadMegabytes = parsePositiveNumber(process.env.PERFORMANCE_RANDOM_SIZE_MB || process.env.RANDOM_SIZE, 10);
  return {
    databaseName: process.env.PERFORMANCE_DATABASE_NAME || process.env.DATABASE_NAME || 'geesome_test',
    iterations: parsePositiveInteger(process.env.PERFORMANCE_ITERATIONS, 5),
    payloadBytes: Math.max(1, Math.round(payloadMegabytes * 1024 * 1024)),
    fileName: process.env.PERFORMANCE_FILE_NAME || 'performance-content.bin',
    flushDatabase: parseBoolean(process.env.PERFORMANCE_FLUSH_DATABASE, false),
    port: parsePositiveInteger(process.env.PERFORMANCE_PORT || process.env.PORT, 7771),
    skipFrontendStorage: parseBoolean(process.env.PERFORMANCE_SKIP_FRONTEND_STORAGE, true),
    waitForPin: parseBoolean(process.env.PERFORMANCE_WAIT_FOR_PIN, false)
  };
}

async function setupAdminIfNeeded(app: IGeesomeApp) {
  if ((await app.ms.database.getUsersCount()) > 0) {
    return;
  }
  await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value as any);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? '').toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function roundMegabytesPerSecond(bytes, durationMs) {
  if (durationMs <= 0) {
    return 0;
  }
  return roundNumber((bytes / 1024 / 1024) / (durationMs / 1000));
}

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

run()
  .then(() => process.exit(process.exitCode || 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
