import {randomBytes} from 'node:crypto';
import {ApiProblemError} from '../api/problem.js';

export function createTelegramLoginFlow(login, options: any = {}) {
	const challenges = new Map<string, any>();
	const now = options.now || (() => Date.now());
	const ttl = options.ttlMs || 600000;
	function remove(id) {
		const state = challenges.get(id);
		if (state?.timer) {
			clearTimeout(state.timer);
		}
		challenges.delete(id);
	}
	function prune() {
		for (const [key, state] of challenges) {
			if (state.expiresAt <= now()) {
				remove(key);
			}
		}
	}
	async function invoke(state, input) {
		let client;
		try {
			const result = await login(state.userId, {...state.credentials, ...input, isEncrypted: false}, {
				transient: true, transientSession: state.session || '', onClient: value => {client = value;}
			});
			client ||= result.client;
			state.session = result.result?.sessionKey || client?.session?.save();
			return {...result.result, ...(result.error ? {error: String(result.error)} : {})};
		} finally {
			await client?.disconnect();
		}
	}
	return {
		async start(userId, clientId, input) {
			prune();
			if (!input || Object.keys(input).some(key => !['apiId', 'apiKey', 'phoneNumber'].includes(key)) ||
				!['number', 'string'].includes(typeof input.apiId) || !/^[0-9]+$/.test(String(input.apiId)) || !Number.isInteger(Number(input.apiId)) || Number(input.apiId) < 1 || Number(input.apiId) > 2147483647 ||
				typeof input.apiKey !== 'string' || !/^[a-fA-F0-9]{32}$/.test(input.apiKey) || typeof input.phoneNumber !== 'string' || !/^\+[1-9][0-9]{7,14}$/.test(input.phoneNumber)) {
				throw problem(400, 'telegram_login_input_invalid');
			}
			if (challenges.size >= 100 || [...challenges.values()].filter(row => row.userId === userId).length >= 3) {
				throw problem(429, 'telegram_login_limit');
			}
			const challengeId = randomBytes(24).toString('hex');
			const state: any = {userId, clientId, credentials: {...input, apiId: Number(input.apiId)}, expiresAt: now() + ttl, stage: 'starting', attempts: 0, busy: true};
			state.timer = setTimeout(() => remove(challengeId), ttl);
			state.timer.unref?.();
			challenges.set(challengeId, state);
			try {
				const result = await invoke(state, {stage: 1});
				if (!result?.response?.phoneCodeHash || !state.session) {
					throw problem(502, 'telegram_login_unavailable');
				}
				state.phoneCodeHash = result.response.phoneCodeHash;
				state.stage = 'code';
				return {challengeId, stage: 'code', expiresAt: new Date(state.expiresAt).toISOString()};
			} catch {
				remove(challengeId);
				throw problem(502, 'telegram_login_code_request_failed');
			} finally {
				state.busy = false;
			}
		},
		async complete(userId, clientId, input) {
			prune();
			if (!input || Object.keys(input).some(key => !['challengeId', 'code', 'password'].includes(key))) {
				throw problem(400, 'telegram_login_input_invalid');
			}
			const state = challenges.get(input.challengeId);
			if (!state || state.userId !== userId || state.clientId !== clientId) {
				throw problem(404, 'telegram_login_expired');
			}
			if (state.busy) {
				throw problem(409, 'telegram_login_busy');
			}
			if (state.stage === 'code' ? typeof input.code !== 'string' || !/^[0-9]{3,10}$/.test(input.code) || input.password !== undefined : typeof input.password !== 'string' || !input.password || input.password.length > 1024 || input.code !== undefined) {
				throw problem(400, 'telegram_login_input_invalid');
			}
			state.busy = true;
			state.attempts++;
			try {
				const result = await invoke(state, state.stage === 'code' ? {stage: 2, phoneCodeHash: state.phoneCodeHash, phoneCode: input.code} : {stage: 3, password: input.password});
				if (String(result?.error || '').includes('SESSION_PASSWORD_NEEDED')) {
					state.stage = 'password';
					return {challengeId: input.challengeId, stage: 'password', expiresAt: new Date(state.expiresAt).toISOString()};
				}
				if (!result?.account?.id || !result.account.sessionKey || result.account.userId !== userId) {
					throw problem(502, 'telegram_login_unavailable');
				}
				remove(input.challengeId);
				return {stage: 'connected', account: safeTelegramAccount(result.account)};
			} catch {
				if (state.attempts >= 5) {
					remove(input.challengeId);
				}
				throw problem(400, state.stage === 'password' ? 'telegram_login_password_invalid' : 'telegram_login_code_invalid');
			} finally {
				state.busy = false;
			}
		},
		cancel(userId, clientId, challengeId) {
			const state = challenges.get(challengeId);
			if (state && state.userId === userId && state.clientId === clientId && state.busy) {
				throw problem(409, 'telegram_login_busy');
			}
			if (state && state.userId === userId && state.clientId === clientId) {
				remove(challengeId);
			}
			return {cancelled: true};
		}
	};
}
export function safeTelegramAccount(row) {
	return {id: row.id, label: row.username ? `@${row.username}` : String(row.fullName || 'Telegram').trim(), ready: !!row.sessionKey && !!row.accountId && Number.isSafeInteger(Number(row.apiId)) && Number(row.apiId) > 0 && /^[a-fA-F0-9]{32}$/.test(row.apiKey || '') && row.isEncrypted !== true && !row.serverCredentialsEncrypted};
}
function problem(status, code) {return new ApiProblemError(status, code, code);}
