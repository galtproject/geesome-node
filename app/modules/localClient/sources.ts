import {createHash} from 'node:crypto';
import {Op, fn, col} from 'sequelize';
import {GroupType} from '../group/interface.js';

export function isOwnedQueueGroup(group, userId) {
	return Boolean(group && Number(group.creatorId) === Number(userId) && group.isPublic === false && group.isOpen === false &&
		!group.isEncrypted && !group.isRemote && !group.isDeleted && !group.isCollateral && group.type === GroupType.Channel);
}

export function sourceView(group, lastPostAt = null) {
	return {id: group.id, name: group.name, title: group.title, lastPostAt};
}

export function getSourceMethods(app, helpers) {
	const {problem, boundedInteger} = helpers;
	const initializations = new Map();
	const {Group, Post} = app.ms.database?.models || {};
	return {
		async listSources(userId, query = {}) {
			const limit = boundedInteger(query.limit ?? 20, 1, 100);
			const offset = boundedInteger(query.offset ?? 0, 0, 1000000);
			let ids;
			if (query.ids !== undefined) {
				if (typeof query.ids !== 'string' || !query.ids || query.ids.split(',').length > 100) {
					throw problem(400, 'local_publication_ids_invalid');
				}
				ids = query.ids.split(',').map(id => boundedInteger(id, 1, Number.MAX_SAFE_INTEGER));
				if (new Set(ids).size !== ids.length) {
					throw problem(400, 'local_publication_ids_invalid');
				}
			}
			const groups = await Group.findAll({where: {...(ids ? {id: {[Op.in]: ids}} : {}), creatorId: userId, type: GroupType.Channel, isPublic: false, isOpen: false,
				isDeleted: false, isRemote: {[Op.not]: true}, isEncrypted: {[Op.not]: true}, isCollateral: {[Op.not]: true}},
				limit, offset, order: [['createdAt', 'DESC'], ['id', 'DESC']]});
			const lastPosts = groups.length ? await Post.findAll({attributes: ['groupId', [fn('MAX', col('createdAt')), 'lastPostAt']],
				where: {groupId: {[Op.in]: groups.map(group => group.id)}, isDeleted: false}, group: ['groupId'], raw: true}) : [];
			const dates = new Map(lastPosts.map(post => [Number(post.groupId), post.lastPostAt]));
			return {ownerId: Number(userId), groups: groups.map(group => sourceView(group, dates.get(Number(group.id)) || null))};
		},
		async createSource(userId, input) {
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'title'].includes(key)) ||
				typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey) ||
				(input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 || /[\u0000-\u001f\u007f]/.test(input.title)))) {
				throw problem(400, 'local_publication_source_invalid');
			}
			const title = input.title === undefined ? 'Publication queue' : input.title.trim();
			const name = `queue-${createHash('sha256').update(`${userId}:${input.requestKey}`).digest('hex').slice(0, 32)}`;
			const intent = createHash('sha256').update(JSON.stringify({requestKey: input.requestKey, title})).digest('hex');
			const find = () => app.ms.group.getGroupByParams({name, isCollateral: false});
			async function ensure() {
				let group = await find();
				if (!group) {
					try {
						group = await app.ms.group.createGroup(userId, {name, title, type: GroupType.Channel, isPublic: false, isOpen: false,
							isEncrypted: false, isRemote: false, isCollateral: false, propertiesJson: JSON.stringify({localPublishingSource: intent})}, {reuseOwnedStaticAccount: true});
					} catch (error) {
						if (error.name !== 'SequelizeUniqueConstraintError' && error.message !== 'name_already_exists') {
							throw error;
						}
						group = await find();
					}
				}
				let storedIntent;
				try {
					storedIntent = JSON.parse(group?.propertiesJson || '{}').localPublishingSource;
				} catch {}
				if (!isOwnedQueueGroup(group, userId) || storedIntent !== intent) {
					throw problem(409, 'local_publication_source_conflict');
				}
				if (!await app.ms.group.isAdminInGroup(userId, group.id)) {
					await app.ms.staticId.setStaticAccountGroupId(userId, group.name, group.id);
					await app.ms.group.addAdminToGroupPure(userId, group.id);
				}
				return {ownerId: Number(userId), group: sourceView(group)};
			}
			if (!initializations.has(name)) {
				initializations.set(name, ensure());
			}
			try {
				const result = await initializations.get(name);
				// Concurrent reuse of a key with a different title must still conflict.
				const group = await find();
				if (JSON.parse(group.propertiesJson || '{}').localPublishingSource !== intent) {
					throw problem(409, 'local_publication_source_conflict');
				}
				return result;
			} finally {
				initializations.delete(name);
			}
		}
	};
}
