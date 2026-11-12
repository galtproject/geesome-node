import {Op, UniqueConstraintError} from 'sequelize';
import {isDeepStrictEqual} from 'node:util';
import {ApiProblemError} from '../api/problem.js';
import {CorePermissionName} from '../database/interface.js';
import {GroupType} from './interface.js';
import {normalizeSubgroupAlias, normalizeSubgroupConfig} from './subgroupConfig.js';

const groupFields = ['id', 'name', 'title', 'description', 'creatorId', 'type', 'isPublic', 'isEncrypted', 'isDeleted', 'isRemote', 'manifestStorageId', 'manifestStaticStorageId', 'staticStorageId'];
const problem = (status, code, title) => new ApiProblemError(status, code, title);
function identifier(value) {
	if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) {
		throw problem(400, 'subgroup_input_invalid', 'Use a valid group identifier.');
	}
	return Number(value);
}
function view(row) {
	return {parentGroupId: Number(row.parentGroupId), subgroupId: Number(row.subgroupId), alias: row.alias, config: structuredClone(row.config), revision: Number(row.revision)};
}
function available(group, userId, publicOnly = false) {
	return group && Number(group.creatorId) === Number(userId) && group.type === GroupType.Channel && !group.isDeleted && !group.isRemote && !group.isEncrypted && (!publicOnly || group.isPublic === true);
}

export function getSubgroupMethods(app, models) {
	const Relation = models.GroupSubgroup, Group = models.Group;
	async function parent(userId, parentGroupId, transaction?) {
		await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
		const group = await Group.findByPk(identifier(parentGroupId), {transaction});
		if (!available(group, userId)) {
			throw problem(404, 'subgroup_parent_unavailable', 'The owned parent channel is unavailable.');
		}
		return group;
	}
	function requireModel() {
		if (!Relation) {
			throw problem(503, 'subgroups_unavailable', 'Subgroup support is unavailable.');
		}
	}
	return {
		async listSubgroups(userId, parentGroupId) {
			requireModel();
			await parent(userId, parentGroupId);
			const rows = await Relation.findAll({where: {parentGroupId: identifier(parentGroupId)}, order: [['id', 'ASC']], limit: 100});
			return {subgroups: rows.map(view)};
		},
		async getRenderableSubgroups(userId, parentGroupId) {
			requireModel();
			await parent(userId, parentGroupId);
			const rows = await Relation.findAll({where: {parentGroupId: identifier(parentGroupId)}, order: [['id', 'ASC']], limit: 100});
			const groups = await Group.findAll({where: {id: {[Op.in]: rows.map(row => row.subgroupId)}}, attributes: groupFields});
			return rows.flatMap(row => {
				const group = groups.find(group => Number(group.id) === Number(row.subgroupId));
				if (!available(group, userId, true)) {
					return [];
				}
				try {
					return [{...view(row), alias: normalizeSubgroupAlias(row.alias), config: normalizeSubgroupConfig(row.config), group: group.toJSON()}];
				} catch {
					return [];
				}
			}).sort((a, b) => (a.config.order || 0) - (b.config.order || 0) || a.alias.localeCompare(b.alias));
		},
		async saveSubgroup(userId, parentGroupId, input) {
			requireModel();
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['subgroupId', 'alias', 'config', 'revision'].includes(key))) {
				throw problem(400, 'subgroup_input_invalid', 'Use subgroupId, alias, config and an existing revision when editing.');
			}
			const parentId = identifier(parentGroupId), childId = identifier(input.subgroupId);
			const alias = normalizeSubgroupAlias(input.alias), config = normalizeSubgroupConfig(input.config);
			if (parentId === childId || input.revision !== undefined && (!Number.isSafeInteger(input.revision) || input.revision < 1)) {
				throw problem(400, 'subgroup_input_invalid', 'A subgroup must be a distinct channel with a valid revision.');
			}
			await app.checkUserCan(userId, CorePermissionName.UserGroupManagement);
			try {
				return await Relation.sequelize.transaction(async transaction => {
					const groups = await Group.findAll({where: {id: {[Op.in]: [parentId, childId]}}, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE});
					if (!available(groups.find(group => Number(group.id) === parentId), userId) || !available(groups.find(group => Number(group.id) === childId), userId, true)) {
						throw problem(404, 'subgroup_channel_unavailable', 'Use an owned parent channel and an owned public subgroup.');
					}
					const row = await Relation.findOne({where: {parentGroupId: parentId, subgroupId: childId}, transaction, lock: transaction.LOCK.UPDATE});
					if (!row) {
						if (input.revision !== undefined || await Relation.count({where: {parentGroupId: parentId}, transaction}) >= 100) {
							throw problem(409, 'subgroup_changed', 'Refresh subgroup links before saving.');
						}
						return {subgroup: view(await Relation.create({parentGroupId: parentId, subgroupId: childId, alias, config}, {transaction}))};
					}
					const unchanged = row.alias === alias && isDeepStrictEqual(row.config, config);
					if (unchanged && (input.revision === undefined || input.revision === row.revision || input.revision === row.revision - 1)) {
						return {subgroup: view(row)};
					}
					if (input.revision !== row.revision) {
						throw problem(409, 'subgroup_changed', 'The subgroup link changed. Refresh before saving.');
					}
					await row.update({alias, config, revision: row.revision + 1}, {transaction});
					return {subgroup: view(row)};
				});
			} catch (error) {
				if (error instanceof UniqueConstraintError) {
					throw problem(409, 'subgroup_alias_conflict', 'This parent channel already uses the alias.');
				}
				throw error;
			}
		},
		async removeSubgroup(userId, parentGroupId, input) {
			requireModel();
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['subgroupId', 'revision'].includes(key)) || !Number.isSafeInteger(input.revision) || input.revision < 1) {
				throw problem(400, 'subgroup_input_invalid', 'Use subgroupId and its current revision.');
			}
			return Relation.sequelize.transaction(async transaction => {
				await parent(userId, parentGroupId, transaction);
				const row = await Relation.findOne({where: {parentGroupId: identifier(parentGroupId), subgroupId: identifier(input.subgroupId)}, transaction, lock: transaction.LOCK.UPDATE});
				if (!row) {
					return {removed: true};
				}
				if (row.revision !== input.revision) {
					throw problem(409, 'subgroup_changed', 'The subgroup link changed. Refresh before removing.');
				}
				await row.destroy({transaction});
				return {removed: true};
			});
		}
	};
}
