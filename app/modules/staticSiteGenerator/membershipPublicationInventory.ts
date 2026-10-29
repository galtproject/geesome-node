import {hashPublicationInput, normalizePublicationCid} from './publicationIdentity.js';
import type {InventoryEntry, PublicationInventory} from './publicationTreeAssembly.js';

const baseDirectories = ['account', 'media', 'page', 'posts', 'public'];
const managedFile = /^(index\.html|style\.css|public\/client\.js|account\/index\.html|posts\/[1-9][0-9]*\/index\.html|page\/[1-9][0-9]*\/index\.html|media\/[a-f0-9]{64}\.[a-zA-Z0-9_-]+)$/;

export function canonicalMembershipPublicationInventory(entries: InventoryEntry[]): PublicationInventory {
	const files = new Set<string>(), directories = new Set(baseDirectories);
	for (const entry of entries) {
		if (!entry || !managedFile.test(entry.path) || files.has(entry.path) ||
			!['file', 'opaque-subtree'].includes(entry.kind) || (entry.kind === 'opaque-subtree' && !entry.path.startsWith('media/')) || normalizePublicationCid(entry.cid) !== entry.cid) {
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
	return {version: 1, resourceId, variant, root, digest: hashPublicationInput(inventory), inventory};
}

// Only our complete writer can establish this capability, never an owner-supplied root.
export function readVerifiedPublicationInventory(manifest, resourceId, variant): PublicationInventory | null {
	try {
		const value = manifest?.assembly?.[variant];
		if (manifest?.version !== 2 || value?.version !== 1 || value.resourceId !== resourceId || value.variant !== variant || value.root !== manifest[variant] || normalizePublicationCid(value.root) !== value.root) {
			return null;
		}
		const inventory = canonicalMembershipPublicationInventory(value.inventory.entries);
		if (hashPublicationInput(inventory) !== value.digest || hashPublicationInput(value.inventory.directories) !== hashPublicationInput(inventory.directories)) {
			return null;
		}
		const files = Object.entries(manifest.files[variant]).map(([path, file]: [string, any]) => ({path, cid: file.cid})).sort((a, b) => a.path.localeCompare(b.path, 'en'));
		const managed = inventory.entries.filter(entry => !entry.path.startsWith('media/')).map(({path, cid}) => ({path, cid}));
		const media = inventory.entries.filter(entry => entry.path.startsWith('media/')).map(entry => entry.path.slice(6)).sort();
		if (hashPublicationInput(files) !== hashPublicationInput(managed) || hashPublicationInput([...manifest.media[variant]].sort()) !== hashPublicationInput(media)) {
			return null;
		}
		return inventory;
	} catch {
		return null;
	}
}
