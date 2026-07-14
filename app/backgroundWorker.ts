export interface IBackgroundWorker {
	stop(): Promise<void>;
}

export interface IIntervalWorkerOptions {
	intervalMs: number;
	onError(error): void;
}

export interface IIntervalWorkerGroup extends IBackgroundWorker {
	add(run: () => Promise<any>, options: IIntervalWorkerOptions): void;
}

export function startIntervalWorker(
	run: () => Promise<any>,
	options: IIntervalWorkerOptions
): IBackgroundWorker {
	let runPromise: Promise<any> | null = null;
	let stopPromise: Promise<void> | null = null;
	let stopped = false;
	const timer = setInterval(() => {
		if (stopped || runPromise) {
			return;
		}
		runPromise = Promise.resolve()
			.then(run)
			.catch(options.onError)
			.finally(() => {
				runPromise = null;
			});
	}, options.intervalMs);
	timer.unref?.();

	return {
		stop() {
			if (!stopPromise) {
				stopped = true;
				clearInterval(timer);
				stopPromise = Promise.resolve(runPromise).then(() => undefined);
			}
			return stopPromise;
		}
	};
}

export function createIntervalWorkerGroup(): IIntervalWorkerGroup {
	let workers: IBackgroundWorker[] = [];
	let stopPromise: Promise<void> | null = null;
	let stopped = false;

	return {
		add(run, options) {
			if (stopped) {
				throw new Error('interval_worker_group_stopped');
			}
			workers.push(startIntervalWorker(run, options));
		},
		stop() {
			if (!stopPromise) {
				stopped = true;
				const activeWorkers = workers;
				workers = [];
				stopPromise = Promise.all(activeWorkers.map(worker => worker.stop())).then(() => undefined);
			}
			return stopPromise;
		}
	};
}
