import {createHash} from 'node:crypto';
import {isOwnedQueueGroup} from './sources.js';
import {destinationView, resolveDestinationTarget} from './destinations.js';
import {createServerProviders} from './providers/index.js';
import {normalizeContentPolicy} from './contentPolicy.js';

export function getServerAccountMethods(app, Destination, {normalizeRequest, boundedInteger, problem}, options: any = {}) {
	const providers = options.providers || createServerProviders({fetch: options.fetch});
	const accounts = () => app.ms.database.sequelize.models.socNetAccount;

	async function credentialLock(userId, transaction) {
		const lock = createHash('sha256').update(`deviantart-credentials:${userId}`).digest().readBigInt64BE();
		await Destination.sequelize.query('SELECT pg_advisory_xact_lock(:lock)', {replacements: {lock: lock.toString()}, transaction});
	}
	async function saveCredentials(account, credentials, transaction, reconnect = false) {
		let previous;
		if (account.serverCredentialsEncrypted) {
			previous = JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted));
		}
		const retiredRefreshTokens = previous?.retiredRefreshTokens || [];
		const fingerprint = value => createHash('sha256').update(value).digest('hex');
		if (reconnect && retiredRefreshTokens.includes(fingerprint(credentials.refreshToken))) {
			return previous.credentials;
		}
		if (previous?.credentials?.refreshToken && previous.credentials.refreshToken !== credentials.refreshToken) {
			retiredRefreshTokens.push(fingerprint(previous.credentials.refreshToken));
		}
		const encrypted = await app.encryptTextWithAppPass(JSON.stringify({network: 'deviantart', accountIdentity: account.accountId, credentials, retiredRefreshTokens: [...new Set(retiredRefreshTokens)].slice(-256)}));
		await account.update({serverCredentialsEncrypted: encrypted}, {transaction});
		return credentials;
	}

	async function refreshAccountCredentials(userId, accountId, identity, renew) {
		return Destination.sequelize.transaction(async transaction => {
			await credentialLock(userId, transaction);
			const account = await accounts().findOne({where: {id: accountId, userId, socNet: 'deviantart', accountId: identity}, transaction, lock: transaction.LOCK.UPDATE});
			if (!account?.serverCredentialsEncrypted) {
				throw problem(409, 'server_publication_credentials_unavailable');
			}
			const decoded = JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted));
			if (decoded.network !== 'deviantart' || decoded.accountIdentity !== identity || !decoded.credentials) {
				throw problem(409, 'server_publication_credentials_unavailable');
			}
			return saveCredentials(account, await renew(decoded.credentials), transaction);
		});
	}
	async function prepareDeviantArtAccount(userId, credentials, target, localKey) {
		const prepared = await Destination.sequelize.transaction(async transaction => {
			await credentialLock(userId, transaction);
			const previous = await Destination.findOne({where: {userId, executionMode: 'server', localKey}, transaction});
			const account = previous?.network === 'deviantart' ? await accounts().findOne({where: {id: previous.socNetAccountId, userId, socNet: 'deviantart'}, transaction, lock: transaction.LOCK.UPDATE}) : null;
			let verified;
			try {
				verified = await providers.verify('deviantart', credentials, target, account ? async renew => {
					const decoded = JSON.parse(await app.decryptTextWithAppPass(account.serverCredentialsEncrypted));
					if (decoded.network !== 'deviantart' || decoded.accountIdentity !== account.accountId || !decoded.credentials) {
						throw problem(409, 'server_publication_credentials_unavailable');
					}
					return saveCredentials(account, await renew(decoded.credentials), transaction);
				} : undefined);
			} catch {
				// Commit a rotated token even when subsequent identity verification fails.
				return {error: true};
			}
			if (!/^deviantart:[0-9a-f-]{36}$/.test(verified.accountIdentity || '')) {
				return {error: true};
			}
			const [stored] = await accounts().findOrCreate({where: {userId, socNet: 'deviantart', accountId: verified.accountIdentity}, defaults: {username: verified.username || null}, transaction});
			await saveCredentials(stored, verified.credentials || credentials, transaction, true);
			return {verified, account: stored};
		});
		if (prepared.error) {
			throw problem(400, 'server_publication_verification_failed');
		}
		return prepared;
	}

	return {
		async setupServerDestination(userId, input) {
			if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['requestKey', 'network', 'label', 'sourceGroupId', 'account', 'target', 'enabled', 'contentPolicy'].includes(key)) ||
				!['bluesky', 'discord', 'telegram', 'deviantart'].includes(input.network) || typeof input.requestKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.requestKey) ||
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
			const allowed = input.network === 'deviantart' ? ['accessToken', 'clientId', 'clientSecret', 'refreshToken'] : input.network === 'bluesky' ? ['identifier', 'appPassword'] : ['botToken'];
			if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials) || Object.keys(credentials).some(key => !allowed.includes(key)) ||
				allowed.some(key => typeof credentials[key] !== 'string' || !credentials[key] || credentials[key].length > 4096 || /[\u0000-\u001f\u007f]/.test(credentials[key]))) {
				throw problem(400, 'server_publication_credentials_invalid');
			}
			const configured = input.target ?? {};
			const contentPolicy = normalizeContentPolicy(input.contentPolicy);
			const targetKeys = {bluesky: [], discord: ['channelId', 'guildId'], telegram: ['chatId'], deviantart: []}[input.network];
			if (!configured || typeof configured !== 'object' || Array.isArray(configured) || Object.keys(configured).some(key => !targetKeys.includes(key))) {
				throw problem(400, 'local_publication_target_invalid');
			}
			const localKey = `server:${input.requestKey}`;
			let verified, preparedAccount;
			if (input.network === 'deviantart') {
				const prepared = await prepareDeviantArtAccount(userId, credentials, configured, localKey);
				verified = prepared.verified;
				preparedAccount = prepared.account;
			}
			try {
				verified ||= await providers.verify(input.network, credentials, configured);
			} catch {
				throw problem(400, 'server_publication_verification_failed');
			}
			if (typeof verified.accountIdentity !== 'string' || verified.accountIdentity.length > 200 || !(input.network === 'deviantart' ? /^deviantart:[0-9a-f-]{36}$/ : input.network === 'bluesky' ? /^did:[A-Za-z0-9:._%-]+$/ : /^bot:[1-9][0-9]*$/).test(verified.accountIdentity)) {
				throw problem(400, 'server_publication_identity_invalid');
			}
			const target = verified.target || configured;
			normalizeRequest({contentType: 'nsfw', requestKey: 'setup', postId: 1, network: input.network, localAccountId: 'validation', target: input.network === 'deviantart' ? {title: 'Setup', isAiGenerated: false} : resolveDestinationTarget(input.network, target), scheduledAt: '2000-01-01T00:00:00Z'});

			const encrypted = await app.encryptTextWithAppPass(JSON.stringify({network: input.network, accountIdentity: verified.accountIdentity, credentials}));
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

				let account = preparedAccount || await accounts().findOne({where: {userId, socNet: input.network, accountId: verified.accountIdentity}, transaction, lock: transaction.LOCK.UPDATE});
				if (!account) {
					account = await accounts().create({userId, socNet: input.network, accountId: verified.accountIdentity, username: verified.username || null, serverCredentialsEncrypted: encrypted}, {transaction});
				} else if (!preparedAccount) {
					await account.update({serverCredentialsEncrypted: encrypted}, {transaction});
				}
				const data = {userId, localKey, sourceGroupId, network: input.network, label: input.label, contentPolicy, executionMode: 'server', clientId: null,
					localAccountId: null, socNetAccountId: account.id, accountIdentity: verified.accountIdentity, target, enabled: input.enabled === true};
				return previous ? previous.update(data, {transaction}) : Destination.create(data, {transaction});
			});
			return {destination: destinationView(destination)};
		},
		async updateServerDestinationSettings(userId, id, input) {
			if (!input || Object.keys(input).some(key => !['expected', 'enabled', 'contentPolicy'].includes(key)) || typeof input.enabled !== 'boolean') {
				throw problem(400, 'server_publication_settings_invalid');
			}
			const contentPolicy = normalizeContentPolicy(input.contentPolicy);
			const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
			const before = await Destination.findOne({where: {id: boundedInteger(id, 1, Number.MAX_SAFE_INTEGER), userId, executionMode: 'server'}});
			if (!before) {
				throw problem(404, 'local_publication_destination_not_found');
			}
			const account = await this.loadServerAccount(userId, before.socNetAccountId, before.network, before.accountIdentity);
			let verified;
			try {
				verified = await providers.verify(before.network, account.credentials, before.target, account.refreshCredentials);
			} catch {
				throw problem(400, 'server_publication_verification_failed');
			}
			if (verified.accountIdentity !== before.accountIdentity || canonical(verified.target || before.target) !== canonical(before.target)) {
				throw problem(409, 'local_publication_destination_changed');
			}
			return Destination.sequelize.transaction(async transaction => {
				const row = await Destination.findOne({where: {id: boundedInteger(id, 1, Number.MAX_SAFE_INTEGER), userId, executionMode: 'server'}, transaction, lock: transaction.LOCK.UPDATE});
				if (!row) {
					throw problem(404, 'local_publication_destination_not_found');
				}
				if (row.accountIdentity !== before.accountIdentity || canonical(row.target) !== canonical(before.target)) {
					throw problem(409, 'local_publication_destination_changed');
				}
				const expected = destinationView(row);
				const replay = canonical({...expected, enabled: input.expected?.enabled, contentPolicy: input.expected?.contentPolicy}) === canonical(input.expected) && row.enabled === input.enabled && row.contentPolicy === contentPolicy;
				if (canonical(expected) !== canonical(input.expected) && !replay) {
					throw problem(409, 'local_publication_destination_changed');
				}
				if (row.sourceGroupId && !isOwnedQueueGroup(await app.ms.group.getGroup(row.sourceGroupId), userId)) {
					throw problem(403, 'local_publication_source_forbidden');
				}
				await row.update({enabled: input.enabled, contentPolicy}, {transaction});
				return {destination: destinationView(row)};
			});
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
			return {accountIdentity: identity, credentials: decoded.credentials, ...(network === 'deviantart' ? {refreshCredentials: renew => refreshAccountCredentials(userId, accountId, identity, renew)} : {})};
		}
	};
}
