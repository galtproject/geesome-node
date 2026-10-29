import {Op} from 'sequelize';
import {publicationState, savePublicationState} from '../staticSiteGenerator/membershipPublisher.js';

// All source writes in one transaction become visible together. Attachment
// and Post hooks must therefore enqueue one revision for that atomic edit.
// Transaction identity also survives replacement of the registered model hooks.
const invalidatedResources = new WeakMap<object, Set<string>>();

export function registerPublicationSources(app, M, publisher) {
	const database = app.ms.database.sequelize, hooks = [];
	async function invalidateGroups(ids, transaction?) {
		if (!ids.length) {
			return;
		}
		if (!transaction) {
			return database.transaction(t => invalidateGroups(ids, t));
		}
		const resources = await M.resources.findAll({where: {groupId: {[Op.in]: [...new Set(ids.filter(Boolean).map(String))]}}, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE});
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
			if (key === 'id' && !row.changed('title') && !row.changed('description')) {
				return;
			}
			await invalidateGroups([row[key], row.previous(key)], options.transaction);
		});
		hook(model, 'afterDestroy', (row, options) => invalidateGroups([row[key]], options.transaction));
		for (const operation of ['Update', 'Destroy']) {
			hook(model, `beforeBulk${operation}`, async options => {
				if (key === 'id' && operation === 'Update' && options.attributes?.title === undefined && options.attributes?.description === undefined) {
					options.membershipSourceGroups = [];
					return;
				}
				const rows = await model.findAll({where: options.where, attributes: [key], group: [key], transaction: options.transaction, raw: true});
				options.membershipSourceGroups = rows.map(row => row[key]);
				if (options.attributes?.groupId) {
					options.membershipSourceGroups.push(options.attributes.groupId);
				}
			});
			hook(model, `afterBulk${operation}`, options => invalidateGroups(options.membershipSourceGroups || [], options.transaction));
		}
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
