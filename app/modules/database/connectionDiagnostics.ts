import debug from 'debug';
import {QueryTypes} from 'sequelize';
import {startIntervalWorker} from '../../backgroundWorker.js';
import type {IBackgroundWorker} from '../../backgroundWorker.js';
import helpers from '../../helpers.js';

const diagnosticsNamespace = 'geesome:database:connections';
const diagnosticsLog = debug(diagnosticsNamespace);
const defaultIntervalMs = 60000;
const minimumIntervalMs = 1000;
const maximumIntervalMs = 3600000;
const defaultActivityGroupLimit = 20;
const maximumActivityGroupLimit = 50;

export type DatabaseConnectionDiagnosticsSnapshot = {
	time: string;
	configuredPool: {
		max: number | null;
		min: number | null;
		acquireMs: number | null;
		idleMs: number | null;
	};
	runtimePool: {
		size: number | null;
		available: number | null;
		borrowed: number | null;
		waiting: number | null;
	};
	activity: Array<{
		applicationName: string;
		state: string;
		count: number;
	}>;
};

export type DatabaseConnectionDiagnostics = {
	getSnapshot(): Promise<DatabaseConnectionDiagnosticsSnapshot>;
	stop(): Promise<void>;
};

export function startDatabaseConnectionDiagnostics(
	sequelize,
	env = process.env,
	log: any = diagnosticsLog
): DatabaseConnectionDiagnostics {
	const getSnapshot = () => collectDatabaseConnectionDiagnostics(sequelize, env);
	let worker: IBackgroundWorker | null = null;
	if (isDatabaseConnectionDiagnosticsEnabled(env)) {
		if (helpers.parseBoolean(env.GEESOME_DATABASE_CONNECTION_DIAGNOSTICS, false)) {
			log.enabled = true;
		}
		worker = startIntervalWorker(async () => {
			const snapshot = await getSnapshot();
			log('snapshot', snapshot);
		}, {
			intervalMs: getDiagnosticsIntervalMs(env),
			runImmediately: true,
			onError(error) {
				log('sample_failed', getErrorMessage(error));
			}
		});
	}

	return {
		getSnapshot,
		async stop() {
			await worker?.stop();
		}
	};
}

export async function collectDatabaseConnectionDiagnostics(
	sequelize,
	env = process.env
): Promise<DatabaseConnectionDiagnosticsSnapshot> {
	const activityLimit = getActivityGroupLimit(env);
	const activityRows = await sequelize.query(`
		SELECT
			COALESCE(NULLIF(application_name, ''), 'unspecified') AS "applicationName",
			COALESCE(state, 'unknown') AS state,
			COUNT(*)::integer AS count
		FROM pg_stat_activity
		WHERE datname = current_database()
		GROUP BY application_name, state
		ORDER BY count DESC, application_name ASC, state ASC
		LIMIT :limit
	`, {
		type: QueryTypes.SELECT,
		replacements: {limit: activityLimit}
	});

	return {
		time: new Date().toISOString(),
		configuredPool: getConfiguredPoolSnapshot(sequelize),
		runtimePool: getRuntimePoolSnapshot(sequelize),
		activity: normalizeActivityRows(activityRows, activityLimit)
	};
}

export function isDatabaseConnectionDiagnosticsEnabled(env = process.env): boolean {
	return helpers.parseBoolean(env.GEESOME_DATABASE_CONNECTION_DIAGNOSTICS, false)
		|| isDebugNamespaceExplicitlyEnabled(env.DEBUG, diagnosticsNamespace);
}

function getConfiguredPoolSnapshot(sequelize) {
	const pool = sequelize?.options?.pool || {};
	return {
		max: toFiniteNumber(pool.max),
		min: toFiniteNumber(pool.min),
		acquireMs: toFiniteNumber(pool.acquire),
		idleMs: toFiniteNumber(pool.idle)
	};
}

function getRuntimePoolSnapshot(sequelize) {
	const pool = sequelize?.connectionManager?.pool;
	return {
		size: readPoolMetric(pool, ['size', '_count']),
		available: readPoolMetric(pool, ['available'], ['_availableObjects']),
		borrowed: readPoolMetric(pool, ['using'], ['_inUseObjects']),
		waiting: readPoolMetric(pool, ['waiting'], ['_pendingAcquires'])
	};
}

function readPoolMetric(pool, numberKeys: string[], arrayKeys: string[] = []): number | null {
	for (const key of numberKeys) {
		const value = toFiniteNumber(pool?.[key]);
		if (value !== null) {
			return value;
		}
	}
	for (const key of arrayKeys) {
		if (Array.isArray(pool?.[key])) {
			return pool[key].length;
		}
	}
	return null;
}

function normalizeActivityRows(rows, limit) {
	if (!Array.isArray(rows)) {
		return [];
	}
	return rows.slice(0, limit).map(row => ({
		applicationName: String(row?.applicationName || 'unspecified').slice(0, 128),
		state: String(row?.state || 'unknown').slice(0, 32),
		count: Math.max(0, toFiniteNumber(row?.count) || 0)
	}));
}

function getDiagnosticsIntervalMs(env): number {
	return clampPositiveInteger(
		env.GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_INTERVAL_MS,
		defaultIntervalMs,
		minimumIntervalMs,
		maximumIntervalMs
	);
}

function getActivityGroupLimit(env): number {
	return clampPositiveInteger(
		env.GEESOME_DATABASE_CONNECTION_DIAGNOSTICS_ACTIVITY_LIMIT,
		defaultActivityGroupLimit,
		1,
		maximumActivityGroupLimit
	);
}

function clampPositiveInteger(value, fallback, minimum, maximum): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(maximum, Math.max(minimum, parsed));
}

function toFiniteNumber(value): number | null {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue)) {
		return null;
	}
	return numberValue;
}

function isDebugNamespaceExplicitlyEnabled(debugValue, namespace): boolean {
	return String(debugValue || '')
		.split(/[\s,]+/)
		.some(pattern => pattern === namespace);
}

function getErrorMessage(error): string {
	if (error?.message) {
		return error.message;
	}
	return String(error);
}
