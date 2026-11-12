import {Op} from 'sequelize';
import {publicationState, savePublicationState} from '../staticSiteGenerator/membershipPublisher.js';

// All source writes in one transaction become visible together. Attachment
// and Post hooks must therefore enqueue one revision for that atomic edit.
// Transaction identity also survives replacement of the registered model hooks.
const invalidatedResources = new WeakMap<object, Set<string>>();

export function registerPublicationSources(app, M, publisher) {
	const database = app.ms.database.sequelize, hooks = [];
	const Subgroup = app.ms.database.models.GroupSubgroup;
	const groupFields = ['title', 'description', 'isPublic', 'isEncrypted', 'isDeleted', 'isRemote', 'type', 'creatorId'];
	async function linkedParents(ids, transaction?) {
		if (!Subgroup || !ids.length) {
			return [];
		}
		const links = await Subgroup.findAll({where: {subgroupId: {[Op.in]: ids}}, attributes: ['parentGroupId'], transaction, raw: true});
		return links.map(link => link.parentGroupId);
	}
	async function invalidateGroups(ids, transaction?, includeParents = true) {
		if (!ids.length) {
			return;
		}
		if (!transaction) {
			return database.transaction(t => invalidateGroups(ids, t, includeParents));
		}
		const sourceIds = ids.filter(Boolean);
		const parents = includeParents ? await linkedParents(sourceIds, transaction) : [];
		const resources = await M.resources.findAll({where: {groupId: {[Op.in]: [...new Set([...sourceIds, ...parents].map(String))]}}, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE});
		let invalidated = invalidatedResources.get(transaction);
		if (!invalidated) {
			invalidated = new Set();
			invalidatedResources.set(transaction, invalidated);
		}
		for (const row of resources) {
			if (invalidated.has(row.id)) {
				continue;
			}
			invalidated.add(row.id);
			const previous = publicationState(row), sourceVersion = previous.sourceVersion + 1;
			await savePublicationState(row, {...previous, sourceVersion}, transaction);
			if (previous.publicationId) {
				await publisher.enqueue(row.id, `auto:${sourceVersion}`, transaction);
			}
		}
	}
	function hook(model, name, callback) {
		if (!model?.addHook) {
			return;
		}
		model.removeHook(name, 'membership-publication-source');
		model.addHook(name, 'membership-publication-source', callback);
		hooks.push([model, name]);
	}
	for (const [model, key] of [[app.ms.database.models.Post, 'groupId'], [app.ms.database.models.Group, 'id']]) {
		hook(model, 'afterSave', async (row, options) => {
			if (key === 'id' && !groupFields.some(field => row.changed(field))) {
				return;
			}
			await invalidateGroups([row[key], row.previous(key)], options.transaction);
		});
		if (key === 'id') {
			hook(model, 'beforeDestroy', async (row, options) => {
				// Hold the same Group fence used by subgroup saves until DELETE commits.
				// A caller without a transaction cannot make a pre-delete snapshot atomic.
				if (options.transaction) {
					await model.findAll({where: {id: row.id}, attributes: ['id'], order: [['id', 'ASC']], transaction: options.transaction, lock: options.transaction.LOCK.UPDATE});
				}
				options.membershipDeletedParents = await linkedParents([row.id], options.transaction);
			});
		}
		hook(model, 'afterDestroy', (row, options) => invalidateGroups([row[key], ...(options.membershipDeletedParents || [])], options.transaction, key !== 'id'));
		for (const operation of ['Update', 'Destroy']) {
			hook(model, `beforeBulk${operation}`, async options => {
				if (key === 'id' && operation === 'Update' && !groupFields.some(field => options.attributes?.[field] !== undefined)) {
					options.membershipSourceGroups = [];
					return;
				}
				const groupDelete = key === 'id' && operation === 'Destroy';
				const rows = await model.findAll({where: options.where, attributes: [key],
					...(groupDelete ? {order: [['id', 'ASC']], ...(options.transaction ? {lock: options.transaction.LOCK.UPDATE} : {})} : {group: [key]}),
					transaction: options.transaction, raw: true});
				options.membershipSourceGroups = rows.map(row => row[key]);
				if (key === 'id' && operation === 'Destroy') {
					options.membershipSourceGroups.push(...await linkedParents(options.membershipSourceGroups, options.transaction));
				}
				if (options.attributes?.groupId) {
					options.membershipSourceGroups.push(options.attributes.groupId);
				}
			});
			hook(model, `afterBulk${operation}`, options => invalidateGroups(options.membershipSourceGroups || [], options.transaction, key !== 'id' || operation !== 'Destroy'));
		}
	}
	for (const event of ['afterSave', 'afterDestroy']) {
		hook(Subgroup, event, (row, options) => invalidateGroups([row.parentGroupId, row.previous('parentGroupId')], options.transaction, false));
	}
	hook(Subgroup, 'afterBulkCreate', (rows, options) => invalidateGroups(rows.map(row => row.parentGroupId), options.transaction, false));
	for (const operation of ['Update', 'Destroy']) {
		hook(Subgroup, `beforeBulk${operation}`, async options => {
			const links = await Subgroup.findAll({where: options.where, attributes: ['parentGroupId'], transaction: options.transaction, raw: true});
			options.membershipSubgroupParents = links.map(link => link.parentGroupId);
			if (options.attributes?.parentGroupId) {
				options.membershipSubgroupParents.push(options.attributes.parentGroupId);
			}
		});
		hook(Subgroup, `afterBulk${operation}`, options => invalidateGroups(options.membershipSubgroupParents || [], options.transaction, false));
	}
	for (const event of ['afterSave', 'afterDestroy']) {
		hook(M.options, event, async (option, options) => {
			const row = await M.resources.findByPk(option.resourceId, {transaction: options.transaction});
			if (row) {
				await invalidateGroups([row.groupId], options.transaction);
			}
		});
	}
	return {
		invalidateGroup: (id, transaction?) => invalidateGroups([id], transaction),
		stop() {
			for (const [model, name] of hooks) {
				model.removeHook(name, 'membership-publication-source');
			}
		}
	};
}
