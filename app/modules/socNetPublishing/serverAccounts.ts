import {createHash} from 'node:crypto';
import {isOwnedQueueGroup} from './sources.js';
import {destinationView, resolveDestinationTarget} from './destinations.js';
import {createServerProviders} from './providers/index.js';
import {normalizeContentPolicy} from './contentPolicy.js';

export function getServerAccountMethods(app, Destination, {normalizeRequest, boundedInteger, problem}, options: any = {}) {
	const providers = options.providers || createServerProviders({fetch: options.fetch});
	const accounts = () => app.ms.database.sequelize.models.socNetAccount;
	return {
		async setupServerDestination(userId, input) {
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'network', 'label', 'sourceGroupId', 'account', 'target', 'enabled', 'contentPolicy'].includes(key)) ||
				!['bluesky', 'discord', 'telegram'].includes(input.network) || typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey) ||
				typeof input.label !== 'string' || !input.label.trim() || input.label.length > 200 || /[\u0000-\u001f\u007f]/.test(input.label) ||
				input.enabled !== undefined && typeof input.enabled !== 'boolean') {
				throw problem(400, 'server_publication_setup_invalid');
			}
			if (!accounts()) {
				throw problem(409, 'server_publication_accounts_unavailable');
			}
			const sourceGroupId = input.sourceGroupId == null ? null : boundedInteger(input.sourceGroupId, 1, Number.MAX_SAFE_INTEGER);
			if (sourceGroupId && !isOwnedQueueGroup(await app.ms.group.getGroup(sourceGroupId), userId)) {
				throw problem(403, 'local_publication_source_forbidden');
			}
			const credentials = input.account;
			const allowed = input.network === 'bluesky' ? ['identifier', 'appPassword'] : ['botToken'];
			if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) || Object.keys(credentials).some(key => !allowed.includes(key)) ||
				allowed.some(key => typeof credentials[key] !== 'string' || !credentials[key] || credentials[key].length > 4096 || /[\u0000-\u001f\u007f]/.test(credentials[key]))) {
				throw problem(400, 'server_publication_credentials_invalid');
			}
			const configured = input.target ?? {};
			const contentPolicy = normalizeContentPolicy(input.contentPolicy);
			const targetKeys = {bluesky: [], discord: ['channelId', 'guildId'], telegram: ['chatId']}[input.network];
			if (!configured || typeof configured !== 'object' || Array.isArray(configured) || Object.keys(configured).some(key => !targetKeys.includes(key))) {
				throw problem(400, 'local_publication_target_invalid');
			}
			let verified;
			try {
				verified = await providers.verify(input.network, credentials, configured);
			} catch {
				throw problem(400, 'server_publication_verification_failed');
			}
			if (typeof verified.accountIdentity !== 'string' || verified.accountIdentity.length > 200 || !(input.network === 'bluesky' ? /^did:[A-Za-z0-9:._%-]+$/ : /^bot:[1-9][0-9]*$/).test(verified.accountIdentity)) {
				throw problem(400, 'server_publication_identity_invalid');
			}
			const target = verified.target || configured;
			normalizeRequest({contentType: 'nsfw', requestKey: 'setup', postId: 1, network: input.network, localAccountId: 'validation', target: resolveDestinationTarget(input.network, target), scheduledAt: '2000-01-01T00:00:00Z'});

			const encrypted = await app.encryptTextWithAppPass(JSON.stringify({network: input.network, accountIdentity: verified.accountIdentity, credentials}));
			const localKey = `server:${input.requestKey}`;
			const sequelize = Destination.sequelize;
			const destination = await sequelize.transaction(async transaction => {
				// Existing account schema has no identity unique index: serialize its upsert.
				for (const identity of [`request:${userId}:${localKey}`, `account:${userId}:${input.network}:${verified.accountIdentity}`]) {
					const lock = createHash('sha256').update(identity).digest().readBigInt64BE();
					await sequelize.query('SELECT pg_advisory_xact_lock(:lock)', {replacements: {lock: lock.toString()}, transaction});
				}
				const previous = await Destination.findOne({where: {userId, executionMode: 'server', localKey}, transaction, lock: transaction.LOCK.UPDATE});
				if (previous && (previous.network !== input.network || previous.accountIdentity !== verified.accountIdentity || previous.sourceGroupId !== sourceGroupId)) {
					throw problem(409, 'server_publication_setup_conflict');
				}

				let account = await accounts().findOne({where: {userId, socNet: input.network, accountId: verified.accountIdentity}, transaction, lock: transaction.LOCK.UPDATE});
				if (!account) {
					account = await accounts().create({userId, socNet: input.network, accountId: verified.accountIdentity, username: verified.username || null, serverCredentialsEncrypted: encrypted}, {transaction});
				} else {
					await account.update({serverCredentialsEncrypted: encrypted}, {transaction});
				}
				const data = {userId, localKey, sourceGroupId, network: input.network, label: input.label, contentPolicy, executionMode: 'server', clientId: null,
					localAccountId: null, socNetAccountId: account.id, accountIdentity: verified.accountIdentity, target, enabled: input.enabled === true};
				return previous ? previous.update(data, {transaction}) : Destination.create(data, {transaction});
			});
			return {destination: destinationView(destination)};
		},
		async loadServerAccount(userId, accountId, network, identity) {
			const account = await accounts()?.findOne({where: {id: accountId, userId, socNet: network, accountId: identity}});
			if (!account?.serverCredentialsEncrypted) {
				throw problem(409, 'server_publication_credentials_unavailable');
			}
			let decoded;
			try {
				decoded = JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted));
			} catch {
				throw problem(409, 'server_publication_credentials_unavailable');
			}
			if (decoded.network !== network || decoded.accountIdentity !== identity || !decoded.credentials) {
				throw problem(409, 'server_publication_credentials_unavailable');
			}
			return {accountIdentity: identity, credentials: decoded.credentials};
		}
	};
}
