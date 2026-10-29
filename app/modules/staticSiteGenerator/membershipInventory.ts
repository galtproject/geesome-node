import {publicationDigest, snapshotCid} from './membershipProjection.js';

export type InventoryEntry = {path: string; cid: string; kind: 'file' | 'opaque-subtree'};
export type PublicationInventory = {entries: InventoryEntry[]; directories: string[]};
const baseDirectories = ['account', 'media', 'page', 'posts', 'public'];
const managedFile = /^(index\.html|style\.css|public\/client\.js|account\/index\.html|posts\/[1-9][0-9]*\/index\.html|page\/[1-9][0-9]*\/index\.html|media\/[a-f0-9]{64}\.[a-zA-Z0-9_-]+)$/;

export function canonicalInventory(entries: InventoryEntry[]): PublicationInventory {
	const files = new Set<string>(), directories = new Set(baseDirectories);
	for (const entry of entries) {
		if (!entry || !managedFile.test(entry.path) || files.has(entry.path) ||
			!['file', 'opaque-subtree'].includes(entry.kind) || (entry.kind === 'opaque-subtree' && !entry.path.startsWith('media/')) || snapshotCid(entry.cid) !== entry.cid) {
			throw new Error('invalid_publication_inventory');
		}
		files.add(entry.path);
		let parent = entry.path.slice(0, entry.path.lastIndexOf('/'));
		while (entry.path.includes('/') && parent) {
			directories.add(parent);
			parent = parent.includes('/') ? parent.slice(0, parent.lastIndexOf('/')) : '';
		}
	}
	for (const path of directories) {
		if (files.has(path)) {
			throw new Error('invalid_publication_inventory');
		}
	}
	return {entries: entries.map(({path, cid, kind}) => ({path, cid, kind})).sort((a, b) => a.path.localeCompare(b.path, 'en')), directories: [...directories].sort()};
}

export function assemblyCapability(resourceId, variant, root, inventory: PublicationInventory) {
	return {version: 1, resourceId, variant, root, digest: publicationDigest(inventory), inventory};
}

// Only our complete writer can establish this capability, never an owner-supplied root.
export function previousInventory(manifest, resourceId, variant): PublicationInventory | null {
	try {
		const value = manifest?.assembly?.[variant];
		if (manifest?.version !== 2 || value?.version !== 1 || value.resourceId !== resourceId || value.variant !== variant || value.root !== manifest[variant] || snapshotCid(value.root) !== value.root) {
			return null;
		}
		const inventory = canonicalInventory(value.inventory.entries);
		if (publicationDigest(inventory) !== value.digest || publicationDigest(value.inventory.directories) !== publicationDigest(inventory.directories)) {
			return null;
		}
		const files = Object.entries(manifest.files[variant]).map(([path, file]: [string, any]) => ({path, cid: file.cid})).sort((a, b) => a.path.localeCompare(b.path, 'en'));
		const managed = inventory.entries.filter(entry => !entry.path.startsWith('media/')).map(({path, cid}) => ({path, cid}));
		const media = inventory.entries.filter(entry => entry.path.startsWith('media/')).map(entry => entry.path.slice(6)).sort();
		if (publicationDigest(files) !== publicationDigest(managed) || publicationDigest([...manifest.media[variant]].sort()) !== publicationDigest(media)) {
			return null;
		}
		return inventory;
	} catch {
		return null;
	}
}

export function canCloneMembershipRoot(storage) {
	return storage.type === 'kubo-rpc' && typeof storage.node?.files?.cp === 'function' && typeof storage.node?.files?.rm === 'function';
}

export async function assembleMembershipTree(storage, directory, desired: PublicationInventory, previous, root, renew, metrics) {
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
	const cid = snapshotCid(await storage.getDirectoryId(directory));
	metrics.rootReads++;
	return cid;
}
