import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {monitorEventLoopDelay, performance} from 'node:perf_hooks';
import debug from 'debug';
import helpers from './helpers.js';

const memoryLog = debug('geesome:memory');
const runtimeLog = debug('geesome:runtime');
const defaultProfilerIntervalSec = 60;
const eventLoopDelayResolutionMs = 20;

let filePath: string | undefined;
let profilerEnabled = false;
let runtimeProfilerEnabled = false;
let profilerTimer: NodeJS.Timeout | null = null;
let eventLoopDelayHistogram: ReturnType<typeof monitorEventLoopDelay> | null = null;
let previousCpuUsage = process.cpuUsage();
let previousCpuTimestamp = process.hrtime.bigint();
let previousEventLoopUtilization = performance.eventLoopUtilization();
const requestStatsByService = new Map<string, RequestStats>();

type RequestStats = {
	started: number;
	completed: number;
	aborted: number;
	inFlight: number;
	totalDurationMs: number;
	methods: Record<string, number>;
	statusClasses: Record<string, number>;
};

export function recordMemorySnapshot(label?: string, extra?: any) {
	if (!isProfilingEnabled()) {
		return null;
	}
	const snapshot = takeMemorySnapshot(label, extra);
	writeSnapshot(snapshot, false);
	return snapshot;
}

export function recordRuntimeSnapshot(label?: string) {
	if (!runtimeProfilerEnabled) {
		return null;
	}
	const snapshot = {
		...takeMemorySnapshot(label),
		...takeCpuSnapshot(),
		eventLoop: takeEventLoopSnapshot(),
		requests: takeRequestStatsSnapshot()
	};
	writeSnapshot(snapshot, true);
	return snapshot;
}

export function trackRuntimeHttpRequest(serviceName: string, req: any, res: any): void {
	if (!runtimeProfilerEnabled) {
		return;
	}
	const stats = getRequestStats(serviceName);
	const startedAt = performance.now();
	const method = normalizeRequestMethod(req?.method);
	stats.started += 1;
	stats.inFlight += 1;
	stats.methods[method] = (stats.methods[method] || 0) + 1;

	let settled = false;
	const settle = (aborted: boolean) => {
		if (settled) {
			return;
		}
		settled = true;
		stats.inFlight = Math.max(0, stats.inFlight - 1);
		stats.totalDurationMs += performance.now() - startedAt;
		if (aborted) {
			stats.aborted += 1;
			return;
		}
		stats.completed += 1;
		const statusClass = getStatusClass(res?.statusCode);
		stats.statusClasses[statusClass] = (stats.statusClasses[statusClass] || 0) + 1;
	};

	res.once('finish', () => settle(false));
	res.once('close', () => settle(!res.writableEnded));
}

export function startMemoryProfiler() {
	if (profilerTimer) {
		return profilerTimer;
	}
	filePath = getRuntimeLogFilePath();
	runtimeProfilerEnabled = shouldEnableRuntimeProfiler();
	profilerEnabled = isProfilingEnabled() || runtimeProfilerEnabled;
	if (!profilerEnabled) {
		return null;
	}
	prepareLogDirectory();
	if (runtimeProfilerEnabled) {
		resetRuntimeBaselines();
		eventLoopDelayHistogram = monitorEventLoopDelay({resolution: eventLoopDelayResolutionMs});
		eventLoopDelayHistogram.enable();
	}
	recordPeriodicSnapshot();
	profilerTimer = setInterval(recordPeriodicSnapshot, getProfilerIntervalMs());
	profilerTimer.unref();
	return profilerTimer;
}

export function stopMemoryProfiler(): void {
	if (profilerTimer) {
		clearInterval(profilerTimer);
	}
	profilerTimer = null;
	eventLoopDelayHistogram?.disable();
	eventLoopDelayHistogram = null;
	profilerEnabled = false;
	runtimeProfilerEnabled = false;
	filePath = undefined;
	requestStatsByService.clear();
}

function takeMemorySnapshot(label?: string, extra?: any) {
	const memory = process.memoryUsage();
	return {
		time: new Date().toISOString(),
		...(label ? {label} : {}),
		rssMb: toMb(memory.rss),
		heapUsedMb: toMb(memory.heapUsed),
		heapTotalMb: toMb(memory.heapTotal),
		externalMb: toMb(memory.external),
		arrayBuffersMb: toMb(memory.arrayBuffers),
		systemTotalMb: toMb(os.totalmem()),
		systemFreeMb: toMb(os.freemem()),
		uptimeSec: Math.round(process.uptime()),
		...(extra || {})
	};
}

function recordPeriodicSnapshot(): void {
	if (runtimeProfilerEnabled) {
		recordRuntimeSnapshot();
		return;
	}
	recordMemorySnapshot();
}

function takeCpuSnapshot() {
	const currentTimestamp = process.hrtime.bigint();
	const elapsedMicros = Number(currentTimestamp - previousCpuTimestamp) / 1000;
	const cpuUsage = process.cpuUsage(previousCpuUsage);
	const usedMicros = cpuUsage.user + cpuUsage.system;
	previousCpuUsage = process.cpuUsage();
	previousCpuTimestamp = currentTimestamp;
	return {
		processCpuPercent: roundNumber(elapsedMicros > 0 ? usedMicros / elapsedMicros * 100 : 0),
		processUserCpuMs: roundNumber(cpuUsage.user / 1000),
		processSystemCpuMs: roundNumber(cpuUsage.system / 1000),
		systemLoadAverage: os.loadavg().map(roundNumber),
		logicalCpuCount: os.cpus().length
	};
}

function takeEventLoopSnapshot() {
	const utilization = performance.eventLoopUtilization(previousEventLoopUtilization);
	previousEventLoopUtilization = performance.eventLoopUtilization();
	const result = {
		utilization: roundNumber(utilization.utilization),
		activeMs: roundNumber(utilization.active),
		idleMs: roundNumber(utilization.idle),
		delayMeanMs: nanosecondsToMilliseconds(eventLoopDelayHistogram?.mean),
		delayP95Ms: nanosecondsToMilliseconds(eventLoopDelayHistogram?.percentile(95)),
		delayMaxMs: nanosecondsToMilliseconds(eventLoopDelayHistogram?.max)
	};
	eventLoopDelayHistogram?.reset();
	return result;
}

function takeRequestStatsSnapshot() {
	const result = {};
	requestStatsByService.forEach((stats, serviceName) => {
		result[serviceName] = {
			started: stats.started,
			completed: stats.completed,
			aborted: stats.aborted,
			inFlight: stats.inFlight,
			averageDurationMs: roundNumber(
				stats.completed + stats.aborted > 0
					? stats.totalDurationMs / (stats.completed + stats.aborted)
					: 0
			),
			methods: {...stats.methods},
			statusClasses: {...stats.statusClasses}
		};
		resetRequestStatsInterval(stats);
	});
	return result;
}

function getRequestStats(serviceName: string): RequestStats {
	const normalizedServiceName = String(serviceName || 'unknown');
	let stats = requestStatsByService.get(normalizedServiceName);
	if (!stats) {
		stats = createRequestStats();
		requestStatsByService.set(normalizedServiceName, stats);
	}
	return stats;
}

function createRequestStats(): RequestStats {
	return {
		started: 0,
		completed: 0,
		aborted: 0,
		inFlight: 0,
		totalDurationMs: 0,
		methods: {},
		statusClasses: {}
	};
}

function resetRequestStatsInterval(stats: RequestStats): void {
	stats.started = 0;
	stats.completed = 0;
	stats.aborted = 0;
	stats.totalDurationMs = 0;
	stats.methods = {};
	stats.statusClasses = {};
}

function resetRuntimeBaselines(): void {
	previousCpuUsage = process.cpuUsage();
	previousCpuTimestamp = process.hrtime.bigint();
	previousEventLoopUtilization = performance.eventLoopUtilization();
}

function writeSnapshot(snapshot: any, isRuntimeSnapshot: boolean): void {
	helpers.logDebug(memoryLog, () => ['snapshot', snapshot]);
	if (isRuntimeSnapshot) {
		helpers.logDebug(runtimeLog, () => ['snapshot', snapshot]);
	}
	if (!filePath) {
		return;
	}
	fs.appendFile(filePath, `${JSON.stringify(snapshot)}\n`, (e) => {
		if (e) {
			console.error('runtime_log_file_write_error', e.message);
		}
	});
}

function prepareLogDirectory(): void {
	if (!filePath) {
		return;
	}
	try {
		fs.mkdirSync(path.dirname(filePath), {recursive: true});
	} catch (e) {
		console.error('runtime_log_file_dir_error', e.message);
	}
}

function getRuntimeLogFilePath(): string | undefined {
	return process.env.GEESOME_RUNTIME_LOG_FILE || process.env.GEESOME_MEMORY_LOG_FILE || undefined;
}

function getProfilerIntervalMs(): number {
	const rawInterval = process.env.GEESOME_RUNTIME_LOG_INTERVAL_SEC
		|| process.env.GEESOME_MEMORY_LOGS_INTERVAL
		|| '';
	const intervalSec = Number.parseInt(rawInterval, 10);
	return (Number.isFinite(intervalSec) && intervalSec > 0 ? intervalSec : defaultProfilerIntervalSec) * 1000;
}

function isProfilingEnabled(): boolean {
	return memoryLog.enabled || !!filePath;
}

function shouldEnableRuntimeProfiler(): boolean {
	return helpers.parseBoolean(process.env.GEESOME_RUNTIME_PROFILE, false)
		|| !!process.env.GEESOME_RUNTIME_LOG_FILE
		|| isDebugNamespaceExplicitlyEnabled('geesome:runtime');
}

function isDebugNamespaceExplicitlyEnabled(namespace: string): boolean {
	return String(process.env.DEBUG || '')
		.split(/[\s,]+/)
		.some(pattern => pattern === namespace);
}

function normalizeRequestMethod(method): string {
	const normalizedMethod = String(method || 'UNKNOWN').toUpperCase();
	if (!/^[A-Z]+$/.test(normalizedMethod)) {
		return 'UNKNOWN';
	}
	return normalizedMethod;
}

function getStatusClass(statusCode): string {
	const parsedStatusCode = Number(statusCode);
	if (!Number.isInteger(parsedStatusCode) || parsedStatusCode < 100 || parsedStatusCode > 599) {
		return 'unknown';
	}
	return `${Math.floor(parsedStatusCode / 100)}xx`;
}

function nanosecondsToMilliseconds(value): number {
	if (!Number.isFinite(value) || value < 0) {
		return 0;
	}
	return roundNumber(value / 1e6);
}

function toMb(bytes: number): number {
	return roundNumber(bytes / 1024 / 1024);
}

function roundNumber(value: number): number {
	return Math.round(value * 10) / 10;
}
