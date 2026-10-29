import {normalizePublicationCid} from './publicationIdentity.js';
import type {PublicationBuildMetrics} from './publicationMetrics.js';

export type InventoryEntry = {path: string; cid: string; kind: 'file' | 'opaque-subtree'};
export type PublicationInventory = {entries: InventoryEntry[]; directories: string[]};

export function supportsKuboTreeCloning(storage) {
	return storage.type === 'kubo-rpc' && typeof storage.node?.files?.cp === 'function' && typeof storage.node?.files?.rm === 'function';
}

// The caller must validate both inventories before any staging mutation.
export async function assemblePublicationTree(storage, directory, desired: PublicationInventory, previous: PublicationInventory | null, root, renew, metrics: Pick<PublicationBuildMetrics, 'copies' | 'mkdirs' | 'removes' | 'rootReads'>) {
	const clone = Boolean(previous);
	const oldEntries = new Map<string, InventoryEntry>((previous?.entries || []).map(entry => [entry.path, entry]));
	const nextEntries = new Map(desired.entries.map(entry => [entry.path, entry]));
	const oldDirectories = new Set<string>(previous?.directories || []);
	const nextDirectories = new Set(desired.directories);
	await renew();
	if (clone) {
		await storage.copyFileFromId(root, directory);
		metrics.copies++;
	} else {
		await storage.makeDir(directory);
		metrics.mkdirs++;
	}
	for (const [path, entry] of oldEntries) {
		const next = nextEntries.get(path);
		if (!next || next.cid !== entry.cid || next.kind !== entry.kind) {
			await renew();
			await storage.node.files.rm(`${directory}/${path}`, {recursive: true});
			metrics.removes++;
		}
	}
	for (const path of [...oldDirectories].sort((a, b) => b.length - a.length)) {
		if (!nextDirectories.has(path)) {
			await renew();
			await storage.node.files.rm(`${directory}/${path}`, {recursive: true});
			metrics.removes++;
		}
	}
	for (const path of desired.directories) {
		if (!oldDirectories.has(path)) {
			await renew();
			await storage.makeDir(`${directory}/${path}`);
			metrics.mkdirs++;
		}
	}
	for (const entry of desired.entries) {
		const old = oldEntries.get(entry.path);
		if (old?.cid === entry.cid && old?.kind === entry.kind) {
			continue;
		}
		await renew();
		await storage.copyFileFromId(entry.cid, `${directory}/${entry.path}`);
		metrics.copies++;
	}
	await renew();
	const cid = normalizePublicationCid(await storage.getDirectoryId(directory));
	metrics.rootReads++;
	return cid;
}
