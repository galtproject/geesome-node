import {startIntervalWorker} from '../../backgroundWorker.js';

export default function startPublishingWorker(app, module) {
	const config = app.config.socNetPublishingConfig || {};
	if (config.serverWorker !== true && config.serverWorker !== '1') {
		return null;
	}
	// Native group deliveries need no social account module; server claims stay idle
	// until their account model becomes available.
	const intervalMs = Math.max(1000, Math.min(3600000, Number(config.intervalMs) || 60000));
	return startIntervalWorker(() => module.processServerQueue({limit: config.batchSize}), {
		intervalMs,
		onError: () => console.error('Server publication worker could not complete its queue operation. Inspect pending jobs before retrying.')
	});
}
