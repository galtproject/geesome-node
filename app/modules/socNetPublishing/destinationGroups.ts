import {createHash} from 'node:crypto';
import {Op} from 'sequelize';

export function destinationGroupView(row) {
	const {id, label, destinationIds, revision, enabled} = row.toJSON();
	return {id, label, destinationIds, revision, enabled};
}

export function getDestinationGroupMethods(Group, Destination, {problem, boundedInteger}) {
	function normalize(input, create): {label: string; destinationIds: number[]; enabled: boolean; requestKey?: string; revision?: number} {
		const allowed = ['label', 'destinationIds', 'enabled', create ? 'requestKey' : 'revision'];
		if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key)) ||
			typeof input.label !== 'string' || !input.label.trim() || input.label.length > 200 || /[\u0000-\u001f\u007f]/.test(input.label) ||
			typeof input.enabled !== 'boolean' || !Array.isArray(input.destinationIds) || !input.destinationIds.length || input.destinationIds.length > 20 ||
			input.destinationIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(input.destinationIds).size !== input.destinationIds.length) {
			throw problem(400, 'publication_destination_group_invalid');
		}
		if (create && (typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey))) {
			throw problem(400, 'publication_destination_group_invalid');
		}
		return {label: input.label.trim(), destinationIds: input.destinationIds, enabled: input.enabled,
			...(create ? {requestKey: input.requestKey} : {revision: boundedInteger(input.revision, 1, 2147483646)})};
	}
	async function validateMembers(userId, ids, transaction) {
		const rows = await Destination.findAll({where: {userId, id: {[Op.in]: ids}}, transaction, lock: transaction.LOCK.SHARE});
		if (rows.length !== ids.length) {
			throw problem(409, 'publication_destination_group_member_unavailable');
		}
	}
	return {
		async listDestinationGroups(userId, query: any = {}) {
			const rows = await Group.findAll({where: {userId}, order: [['id', 'ASC']],
				limit: boundedInteger(query.limit ?? 20, 1, 100), offset: boundedInteger(query.offset ?? 0, 0, 1000000)});
			return {groups: rows.map(destinationGroupView)};
		},
		async createDestinationGroup(userId, input) {
			const row = normalize(input, true);
			const creationHash = createHash('sha256').update(JSON.stringify(row)).digest('hex');
			return Group.sequelize.transaction(async transaction => {
				await validateMembers(userId, row.destinationIds, transaction);
				const [group] = await Group.findOrCreate({where: {userId, requestKey: row.requestKey}, defaults: {...row, creationHash, revision: 1}, transaction});
				if (group.creationHash !== creationHash) {
					throw problem(409, 'publication_destination_group_request_conflict');
				}
				return {group: destinationGroupView(group)};
			});
		},
		async updateDestinationGroup(userId, id, input) {
			const row = normalize(input, false);
			return Group.sequelize.transaction(async transaction => {
				const group = await Group.findOne({where: {userId, id: boundedInteger(id, 1, Number.MAX_SAFE_INTEGER)}, transaction, lock: transaction.LOCK.UPDATE});
				if (!group) {
					throw problem(404, 'publication_destination_group_not_found');
				}
				const values = {label: row.label, destinationIds: row.destinationIds, enabled: row.enabled};
				const unchanged = group.label === row.label && group.enabled === row.enabled && JSON.stringify(group.destinationIds) === JSON.stringify(row.destinationIds);
				// An exact lost-response replay is safe, but a stale edit cannot overwrite newer membership.
				if (group.revision !== row.revision && !(group.revision === row.revision + 1 && unchanged)) {
					throw problem(409, 'publication_destination_group_changed');
				}
				await validateMembers(userId, row.destinationIds, transaction);
				if (!unchanged) {
					await group.update({...values, revision: group.revision + 1}, {transaction});
				}
				return {group: destinationGroupView(group)};
			});
		}
	};
}
