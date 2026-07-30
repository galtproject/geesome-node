import initializeApp from '../../app/index.js';

let app;

process.on('message', async (message: any) => {
	const {id, command, payload} = message || {};
	try {
		const result = await runCommand(command, payload || {});
		process.send?.({id, result: toPlainValue(result)});
		if (command === 'stop') {
			setImmediate(() => process.exit(0));
		}
	} catch (error) {
		process.send?.({
			id,
			error: error?.message || String(error)
		});
	}
});

start().catch(error => {
	process.send?.({
		type: 'startup-error',
		error: error?.message || String(error)
	});
	process.exitCode = 1;
});

async function start() {
	const appConfig: any = (await import('../../app/config.js')).default;
	app = await initializeApp({
		...appConfig,
		port: Number(process.env.PORT),
		skipFrontendStorage: true,
		storageConfig: {
			...appConfig.storageConfig,
			jsNode: {
				...appConfig.storageConfig.jsNode,
				pass: 'test test test test test test test test test test'
			}
		},
		chatConfig: {
			...appConfig.chatConfig,
			autoProcessDeliveries: false,
			deliveryWorker: false,
			reconciliationWorker: false,
			attachmentCleanupWorker: false
		}
	}, {
		loadModule: async (moduleName, childApp) => {
			const initializeModule = (await import(
				`../../app/modules/${moduleName}/index.js`
			)).default;
			if (moduleName === 'chat') {
				return initializeModule(childApp, {allowHttp: true});
			}
			return initializeModule(childApp);
		}
	});
	process.send?.({type: 'ready'});
}

async function runCommand(command: string, payload: any) {
	if (command === 'setup') {
		return app.setup(payload.user);
	}
	if (command === 'register-device') {
		return app.ms.chat.registerDevice(payload.userId, payload.publicBundle);
	}
	if (command === 'get-transport-public-key') {
		return app.ms.accountStorage.getStaticIdPublicKeyByOr(payload.ownerId);
	}
	if (command === 'accept-event') {
		return app.ms.chat.acceptEncryptedEvent(
			payload.userId,
			payload.envelope,
			payload.options
		);
	}
	if (command === 'process-deliveries') {
		const options = {...payload.options};
		if (options.now) {
			options.now = new Date(options.now);
		}
		return app.ms.chat.processDeliveryQueue(options);
	}
	if (command === 'get-deliveries') {
		return app.ms.chat.getEventDeliveries(payload.userId, payload.messageId);
	}
	if (command === 'get-events') {
		return app.ms.chat.getEncryptedEvents(
			payload.userId,
			payload.conversationId
		);
	}
	if (command === 'stop') {
		await app?.stop();
		return {stopped: true};
	}
	throw new Error(`unknown_chat_node_command:${command}`);
}

function toPlainValue(value) {
	if (value === undefined) {
		return null;
	}
	return JSON.parse(JSON.stringify(value));
}
