import {startIntervalWorker} from '../../backgroundWorker.js';

export default function startPublishingWorker(app, module) {
	const config = app.config.socNetPublishingConfig || {};
	if (config.serverWorker !== true && config.serverWorker !== '1') {
		return null;
	}
	// Main-pack publishing initializes before the later socNet account module.
	// No immediate tick: dependencies finish loading before normal polling, and
	// claimServerJob safely does nothing while the account model is unavailable.
	if (!app.config.modules?.includes('socNetAccount')) {
		throw new Error('server_publishing_requires_socNetAccount');
	}
	const intervalMs = Math.max(1000, Math.min(3600000, Number(config.intervalMs) || 60000));
	return startIntervalWorker(() => module.processServerQueue({limit: config.batchSize}), {
		intervalMs,
		onError: () => console.error('Server publication worker could not complete its queue operation. Inspect pending jobs before retrying.')
	});
}
