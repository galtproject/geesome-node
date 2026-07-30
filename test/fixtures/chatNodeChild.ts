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
	if (command === 'revoke-device') {
		return app.ms.chat.revokeDevice(payload.userId, payload.deviceId);
	}
	if (command === 'get-transport-public-key') {
		return app.ms.accountStorage.getStaticIdPublicKeyByOr(payload.ownerId);
	}
	if (command === 'get-storage-node-id') {
		const nodeInfo = await app.ms.storage.node.id();
		return String(nodeInfo.id);
	}
	if (command === 'connect-storage-peer') {
		await app.ms.storage.swarmConnect(payload.address);
		return {connected: true};
	}
	if (command === 'save-owned-attachment') {
		return saveOwnedAttachment(payload);
	}
	if (command === 'reserve-missing-owned-attachment') {
		return reserveMissingOwnedAttachment(payload);
	}
	if (command === 'save-storage-data') {
		return saveStorageData(payload.dataBase64);
	}
	if (command === 'get-storage-data') {
		return getStorageData(payload.storageId);
	}
	if (command === 'is-storage-pinned') {
		return isStoragePinned(payload.storageId);
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
	if (command === 'reconcile-conversation') {
		return app.ms.chat.reconcileConversation(
			payload.userId,
			payload.conversationId,
			payload.options
		);
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

async function saveOwnedAttachment(payload: any) {
	const data = Buffer.from(payload.dataBase64, 'base64');
	const storageFile = await app.ms.storage.saveFileByData(data);
	await app.ms.storage.addPin(storageFile.id);
	return registerOwnedAttachment(payload, storageFile.id, data.length);
}

async function reserveMissingOwnedAttachment(payload: any) {
	const data = Buffer.from(payload.dataBase64, 'base64');
	const storageFile = await app.ms.storage.node.add(
		{content: data},
		{onlyHash: true, pin: false, cidVersion: 1}
	);
	return registerOwnedAttachment(
		payload,
		String(storageFile.cid),
		data.length
	);
}

async function saveStorageData(dataBase64: string) {
	const data = Buffer.from(dataBase64, 'base64');
	const storageFile = await app.ms.storage.saveFileByData(data);
	await app.ms.storage.addPin(storageFile.id);
	return {storageId: storageFile.id, size: data.length};
}

async function registerOwnedAttachment(
	payload: any,
	storageId: string,
	size: number
) {
	const reservation = await app.ms.chat.createAttachmentUploadReservation(
		payload.userId,
		size
	);
	const content = await app.ms.database.addContent({
		userId: payload.userId,
		storageType: 'ipfs',
		mimeType: 'application/octet-stream',
		storageId,
		size,
		name: payload.name || 'encrypted-chat-attachment'
	});
	await app.ms.chat.afterContentAdding(payload.userId, content, {
		chatAttachmentReservationId: reservation.reservationId
	});
	return {
		storageId,
		size,
		reservationId: reservation.reservationId
	};
}

async function getStorageData(storageId: string) {
	const data = await app.ms.storage.getFileData(storageId);
	const bytes = typeof data?.slice === 'function'
		? data.slice()
		: data;
	return {dataBase64: Buffer.from(bytes).toString('base64')};
}

async function isStoragePinned(storageId: string) {
	for await (const pin of app.ms.storage.node.pin.ls({paths: [storageId]})) {
		if (String(pin.cid) === storageId) {
			return true;
		}
	}
	return false;
}
