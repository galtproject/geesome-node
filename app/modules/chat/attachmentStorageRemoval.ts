import type {IGeesomeApp} from '../../interface.js';

export async function queueChatAttachmentStorageRemoval(
	app: IGeesomeApp,
	userId: number,
	storageId,
	options: any = {}
) {
	if (!storageId) {
		return;
	}
	const storageSpace = app.ms['storageSpace'];
	if (storageSpace?.queueStorageObjectRemoval) {
		await storageSpace.queueStorageObjectRemoval(userId, null, storageId, {
			process: options.processStorageRemoval !== false
		});
		return;
	}
	const deleteSafety = await app.ms.database.getStorageObjectDeleteSafety(storageId);
	if (!deleteSafety.safeToRemovePhysical) {
		return;
	}
	await app.ms.storage.unPin(storageId).catch(() => null);
	await app.ms.storage.remove(storageId).catch(() => null);
}
