import {isOwnedQueueGroup} from './sources.js';
import {ApiProblemError} from '../api/problem.js';
import {normalizeContentPolicy, assertContentPolicy} from './contentPolicy.js';

export function publicationClientId(apiKey) {
	if (!Number.isSafeInteger(Number(apiKey?.id)) || Number(apiKey.id) < 1 || apiKey.type === 'password_auth') {
		throw new ApiProblemError(403, 'local_publication_client_key_required', 'Use a dedicated client API key');
	}
	return `key:${apiKey.id}`;
}

export function resolveDestinationTarget(network, configured, authored: any = {}) {
	const target = {...configured};
	for (const key of Object.keys(target)) {
		if (authored[key] !== undefined && authored[key] !== target[key]) {
			throw new ApiProblemError(409, 'local_publication_destination_changed', 'Destination endpoint does not match');
		}
	}
	return {...target, ...authored};
}

export function getDestinationMethods(Destination, {app, normalizeRequest, problem, boundedInteger, loadServerAccount}) {
	function identifier(value) {
		if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value)) {
			throw problem(400, 'local_publication_destination_invalid');
		}
		return value;
	}
	function normalize(row) {
		if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['localKey', 'network', 'label', 'localAccountId', 'sourceGroupId', 'target', 'enabled', 'contentPolicy'].includes(key)) ||
			typeof row.label !== 'string' || !row.label.trim() || row.label.length > 200 || /[\u0000-\u001f\u007f]/.test(row.label) || typeof row.enabled !== 'boolean') {
			throw problem(400, 'local_publication_destination_invalid');
		}
		const localKey = identifier(row.localKey);
		const localAccountId = identifier(row.localAccountId);
		const target = row.target ?? {};
		const contentPolicy = normalizeContentPolicy(row.contentPolicy);
		const allowed = {discord: ['channelId', 'guildId'], telegram: ['chatId'], patreon: ['campaignId'], reddit: ['subreddit', 'flairId', 'kind']}[row.network] || [];
		if (!target || typeof target !== 'object' || Array.isArray(target) || Object.keys(target).some(key => !allowed.includes(key))) {
			throw problem(400, 'local_publication_destination_invalid');
		}
		if (row.network === 'patreon') {
			if (typeof target.campaignId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(target.campaignId)) {
				throw problem(400, 'local_publication_destination_invalid');
			}
		} else {
			const validationTarget = row.network === 'rule34xxx' ? {tags: 'registration', source: 'https://example.com'} : resolveDestinationTarget(row.network, target);
			normalizeRequest({contentType: 'nsfw', requestKey: 'registration', postId: 1, network: row.network, localAccountId, target: validationTarget, scheduledAt: '2000-01-01T00:00:00Z'});

		}
		return {localKey, sourceGroupId: row.sourceGroupId == null ? null : boundedInteger(row.sourceGroupId, 1, Number.MAX_SAFE_INTEGER), network: row.network, localAccountId, label: row.label, contentPolicy, target, enabled: row.enabled, executionMode: 'client', socNetAccountId: null};
	}
	return {
		async listDestinations(userId, query: any = {}) {
			const rows = await Destination.findAll({where: {userId}, limit: boundedInteger(query.limit ?? 20, 1, 100), offset: boundedInteger(query.offset ?? 0, 0, 1000000), order: [['id', 'ASC']]});
			return {destinations: rows.map(destinationView)};
		},
		async disableDestination(userId, id, input) {
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) {
				throw problem(400, 'local_publication_input_invalid');
			}
			const destination = await Destination.findOne({where: {id: boundedInteger(id, 1, Number.MAX_SAFE_INTEGER), userId}});
			if (!destination) {
				throw problem(404, 'local_publication_destination_not_found');
			}
			await destination.update({enabled: false});
			return {destination: destinationView(destination)};
		},
		async registerDestinations(userId, clientId, input) {
			if (!input || Object.keys(input).some(key => key !== 'destinations') || !Array.isArray(input.destinations) || input.destinations.length > 100) {
				throw problem(400, 'local_publication_destinations_invalid');
			}
			const rows = input.destinations.map(normalize);
			for (const row of rows.filter(item => item.enabled && item.sourceGroupId !== null)) {
				const group = await app.ms.group.getGroup(row.sourceGroupId);
				if (!isOwnedQueueGroup(group, userId)) {
					throw problem(403, 'local_publication_source_forbidden');
				}
			}
			if (new Set(rows.map(row => row.localKey)).size !== rows.length) {
				throw problem(400, 'local_publication_destination_duplicate');
			}
			const destinations = await Destination.sequelize.transaction(async transaction => {
				const result = [];
				for (const row of rows) {
					const [destination] = await Destination.findOrCreate({where: {userId, clientId, localKey: row.localKey}, defaults: row, transaction});
					await destination.reload({transaction, lock: transaction.LOCK.UPDATE});
					if (destination.network !== row.network || destination.localAccountId !== row.localAccountId || destination.executionMode !== 'client' || destination.sourceGroupId !== row.sourceGroupId) {
						throw problem(409, 'local_publication_destination_changed');
					}

					await destination.update(row, {transaction});
					result.push(destinationView(destination));
				}
				return result;
			});
			return {clientId, destinations};
		},
		async resolveDestination(userId, selection, transaction?) {
			const destination = await Destination.findOne({where: {id: boundedInteger(selection.destinationId, 1, Number.MAX_SAFE_INTEGER), userId}, transaction});
			if (!destination || !destination.enabled || !['client', 'server'].includes(destination.executionMode) || destination.network !== selection.network) {
				throw problem(409, 'local_publication_destination_unavailable');
			}
			if (destination.executionMode === 'server' && !transaction) {
				await loadServerAccount(userId, destination.socNetAccountId, destination.network, destination.accountIdentity);
			}
			assertContentPolicy(selection.contentType, destination.contentPolicy);
			const target = resolveDestinationTarget(destination.network, destination.target, selection.target);
			const normalized = normalizeRequest({contentType: selection.contentType, requestKey: 'destination', postId: 1, network: destination.network, localAccountId: destination.executionMode === 'server' ? 'validation' : destination.localAccountId, target, scheduledAt: '2000-01-01T00:00:00Z'});
			return {destinationId: Number(destination.id), sourceGroupId: destination.sourceGroupId, clientId: destination.clientId, executionMode: destination.executionMode, contentPolicy: destination.contentPolicy, contentType: selection.contentType, network: destination.network, localAccountId: destination.localAccountId, target: normalized.target, ...(destination.executionMode === 'server' ? {serverAccountId: destination.socNetAccountId, accountIdentity: destination.accountIdentity} : {})};
		}
	};
}

export function destinationView(row) {
	const {id, clientId, localKey, sourceGroupId, localAccountId, network, label, executionMode, accountIdentity, target, enabled, contentPolicy} = row.toJSON();
	return {id, localKey, sourceGroupId, network, label, executionMode, contentPolicy, target, enabled, ...(executionMode === 'server' ? {accountIdentity} : {clientId, localAccountId})};
}
