import type {IGeesomeApp} from './interface.js';

export type ProcessShutdownSignal = 'SIGINT' | 'SIGTERM';

interface IProcessShutdownTarget {
	on(signal: ProcessShutdownSignal, listener: () => void): any;
	off(signal: ProcessShutdownSignal, listener: () => void): any;
	exit(code: number): any;
}

interface IProcessShutdownLogger {
	error(message: string, error?: any): void;
}

export interface IProcessShutdownOptions {
	timeoutMs?: number;
	processTarget?: IProcessShutdownTarget;
	logger?: IProcessShutdownLogger;
}

export interface IProcessShutdownController {
	shutdown(signal: ProcessShutdownSignal): Promise<void>;
	dispose(): void;
}

const defaultShutdownTimeoutMs = 30000;

export function registerProcessShutdown(
	app: Pick<IGeesomeApp, 'stop'>,
	options: IProcessShutdownOptions = {}
): IProcessShutdownController {
	const processTarget = options.processTarget || process;
	const logger = options.logger || console;
	const timeoutMs = getProcessShutdownTimeoutMs(options.timeoutMs);
	let shutdownPromise: Promise<void> | null = null;

	const dispose = () => {
		processTarget.off('SIGTERM', onSigterm);
		processTarget.off('SIGINT', onSigint);
	};
	const shutdown = (signal: ProcessShutdownSignal) => {
		if (!shutdownPromise) {
			shutdownPromise = stopAppWithinDeadline(app, timeoutMs)
				.then(() => {
					dispose();
					processTarget.exit(0);
				})
				.catch(error => {
					dispose();
					logger.error(`GeeSome shutdown failed after ${signal}`, error);
					processTarget.exit(1);
				});
		}
		return shutdownPromise;
	};
	const handleSignal = (signal: ProcessShutdownSignal) => {
		if (shutdownPromise) {
			dispose();
			processTarget.exit(getSignalExitCode(signal));
			return;
		}
		void shutdown(signal);
	};
	function onSigterm() {
		handleSignal('SIGTERM');
	}
	function onSigint() {
		handleSignal('SIGINT');
	}

	processTarget.on('SIGTERM', onSigterm);
	processTarget.on('SIGINT', onSigint);
	return {shutdown, dispose};
}

export function getProcessShutdownTimeoutMs(value: any = process.env.GEESOME_SHUTDOWN_TIMEOUT_MS): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return defaultShutdownTimeoutMs;
	}
	return parsed;
}

async function stopAppWithinDeadline(app: Pick<IGeesomeApp, 'stop'>, timeoutMs: number): Promise<void> {
	let timeout;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => reject(new Error(`shutdown_timeout:${timeoutMs}`)), timeoutMs);
	});

	try {
		await Promise.race([
			Promise.resolve().then(() => app.stop()),
			timeoutPromise
		]);
	} finally {
		clearTimeout(timeout);
	}
}

function getSignalExitCode(signal: ProcessShutdownSignal): number {
	if (signal === 'SIGINT') {
		return 130;
	}
	return 143;
}
