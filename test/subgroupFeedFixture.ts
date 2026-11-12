import {createHash} from 'node:crypto';
import {CID} from 'multiformats/cid';
import {create as digest} from 'multiformats/hashes/digest';
import {getModule as getGroupModule} from '../app/modules/group/index.js';
import {contentTextToRichText, RICH_TEXT_MIME_TYPE} from '../app/richText.js';

export function subgroupFeedFixture(count = 23) {
	const source = new Map<string, Buffer>(), files = new Map<string, Buffer>(), directories = new Set<string>();
	const cid = value => CID.createV1(0x55, digest(0x12, createHash('sha256').update(value).digest())).toString();
	const save = value => {
		const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
		const id = cid(body);
		source.set(id, body);
		return {id};
	};
	const storage = {
		async saveFileByData(body) { return save(body); },
		async getFileDataText(id) { return source.get(id).toString('utf8'); },
		async copyFileFromId(id, path) {
			if (!source.has(id)) {
				throw new Error('fixture_source_missing');
			}
			files.set(path, source.get(id));
		},
		async makeDir(path) { directories.add(path); },
		async getDirectoryId(path) {
			return cid([...files].filter(([name]) => name.startsWith(path + '/')).sort(([a], [b]) => a.localeCompare(b)).map(([name, body]) => name.slice(path.length) + ':' + cid(body)).join('\n'));
		}
	};
	const image = save('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520"><defs><linearGradient id="a"><stop stop-color="#5645a8"/><stop offset="1" stop-color="#a64b7b"/></linearGradient></defs><rect width="900" height="520" fill="url(#a)"/><circle cx="680" cy="210" r="120" fill="#f4d3b2"/><path d="M0 480 300 200 570 520" fill="#282541"/><text x="50" y="75" fill="white" font-family="sans-serif" font-size="34">Public group artwork</text></svg>');
	const secret = save('PRIVATE-ATTACHMENT-CANARY');
	const posts = Array.from({length: count}, (_, index) => {
		const text = save(JSON.stringify(contentTextToRichText(`Public update ${index + 1}\nAn independent caption ${index + 1}.`, 'text/plain')));
		return {id: index + 1, localId: index + 1, groupId: 20, status: 'published', isDeleted: false, publishedAt: new Date(Date.UTC(2026, 10, index + 1)),
			contents: [{id: index * 3 + 1, storageId: text.id, mimeType: RICH_TEXT_MIME_TYPE, postsContents: {position: 0, isPrivate: false}},
				{id: index * 3 + 2, storageId: image.id, mimeType: 'image/svg+xml', name: 'Public artwork', postsContents: {position: 1, isPrivate: false}},
				{id: index * 3 + 3, storageId: secret.id, mimeType: 'text/plain', postsContents: {position: 2, isPrivate: true}}]};
	});
	const app: any = {ms: {storage}};
	const group = getGroupModule(app, {});
	const hydrated = [];
	group.forEachHydratedGroupPostBatch = async (groupId, options, onBatch) => {
		hydrated.push(groupId);
		if (groupId !== 20 || options.filters.status !== 'published') {
			throw new Error('fixture_wrong_group');
		}
		await onBatch({groupPosts: [...posts].reverse(), refCount: posts.length});
	};
	app.ms.group = group;
	const row = {id: 'creator-resource', ownerId: 7, groupId: 10, domain: 'creator.example', data: {displayTitle: 'Independent creator', displayDescription: 'Public updates and membership archive.',
		coverUrl: '/ipfs/' + image.id, presentation: {schemaVersion: 1, copy: {feedHeading: 'Membership posts'}}}, options: [{id: 'month', amountCents: 500, currency: 'USD', period: 'month'}]};
	const subgroup = {parentGroupId: 10, subgroupId: 20, alias: 'feed', config: {tabLabel: 'Feed', order: 10}, group: {id: 20, creatorId: 7, title: 'Public group', type: 'channel', isPublic: true}};
	const tabs = [{alias: '', label: 'Membership posts', href: '/'}, {alias: 'feed', label: 'Feed', href: '/feed/'}];
	return {app, row, subgroup, tabs, source, files, directories, posts, hydrated, image, secret};
}
