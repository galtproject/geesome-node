import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import defineModels from './models.js';
import registerApi from './api.js';
import { browserCookie, browserSessions, opaqueToken, readBrowserCookie, siteProblem, tokenHash } from '../api/browserSession.js';
export default async function (app) {
	app.checkModules(['database', 'api']);
	const module = createGoogleAuthorization(app, await defineModels(app.ms.database.sequelize));
	registerApi(app, module);
	return module;
}
export function createGoogleAuthorization(app, models, dependencies: any = {}) {
	const clock = dependencies.clock || (() => new Date());
	const google = dependencies.google || new OAuth2Client();
	const sessions = browserSessions(models.Session, clock);
	const sequelize = app.ms.database.sequelize;
	const challengeCookie = '__Host-geesome_login';
	const attempts = new Map<string, {
		count: number;
		expires: number;
	}>();
	function enabled(site) {
		if (app.config.googleAuthorizationConfig?.enabled !== true || !site.googleClientId) {
			siteProblem(503, 'google_login_not_configured');
		}
	}
	function limit(req, site) {
		const now = clock().getTime();
		for (const [key, value] of attempts) {
			if (value.expires <= now) {
				attempts.delete(key);
			}
		}
		const key = `${site.id}:${req.stream?.socket?.remoteAddress || 'unknown'}`;
		const entry = attempts.get(key) || { count: 0, expires: now + 60000 };
		if (entry.count >= 120 || attempts.size >= 10000) {
			siteProblem(429, 'login_rate_limited');
		}
		entry.count += 1;
		attempts.set(key, entry);
	}
	return {
		models, sessions,
		async challenge(req, site) {
			enabled(site);
			limit(req, site);
			const token = opaqueToken(), nonce = opaqueToken();
			await models.Challenge.destroy({ where: { expiresAt: { [Op.lte]: clock() } } });
			await models.Session.destroy({ where: { expiresAt: { [Op.lte]: clock() } } });
			await models.Challenge.create({ id: randomUUID(), siteId: site.id, tokenHash: tokenHash(token), nonceHash: tokenHash(nonce), expiresAt: new Date(clock().getTime() + 300000) });
			return { nonce, googleClientId: site.googleClientId, cookie: browserCookie(challengeCookie, token, 300) };
		},
		async login(req, site) {
			enabled(site);
			limit(req, site);
			const credential = req.body?.credential;
			const token = readBrowserCookie(req, challengeCookie);
			if (!token || typeof credential !== 'string' || !credential || credential.length > 12000) {
				siteProblem(401, 'google_authentication_failed');
			}
			let payload;
			try {
				const ticket = await google.verifyIdToken({ idToken: credential, audience: site.googleClientId });
				payload = ticket.getPayload();
			}
			catch {
				siteProblem(401, 'google_authentication_failed');
			}
			if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
				|| payload.aud !== site.googleClientId || (!Number.isFinite(payload.exp) || payload.exp * 1000 <= clock().getTime())
				|| typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 200
				|| payload.email_verified !== true || typeof payload.email !== 'string' || !payload.email || payload.email.length > 320
				|| typeof payload.nonce !== 'string' || payload.nonce.length > 200) {
				siteProblem(401, 'google_authentication_failed');
			}
			return sequelize.transaction(async (transaction) => {
				const challenge = await models.Challenge.findOne({ where: { siteId: site.id, tokenHash: tokenHash(token), expiresAt: { [Op.gt]: clock() } }, transaction, lock: transaction.LOCK.UPDATE });
				if (!challenge || challenge.nonceHash !== tokenHash(payload.nonce)) {
					siteProblem(401, 'google_authentication_failed');
				}
				await challenge.destroy({ transaction });
				await models.Identity.lockSubject(payload.sub, transaction);
				let identity = await models.Identity.findOne({ where: { provider: 'google', subject: payload.sub }, transaction });
				if (!identity) {
					if (site.registrationEnabled !== true) {
						siteProblem(403, 'reader_registration_disabled');
					}
					const user = await app.ms.database.models.User.create({ name: `reader-${randomUUID()}` }, { transaction });
					identity = await models.Identity.create({ id: randomUUID(), userId: user.id, provider: 'google', subject: payload.sub, email: payload.email, name: String(payload.name || '').slice(0, 200) }, { transaction });
				}
				if (!await app.ms.database.models.User.findByPk(identity.userId, { transaction })) {
					siteProblem(403, 'reader_account_unavailable');
				}
				const previous = readBrowserCookie(req, '__Host-geesome_session');
				if (previous) {
					await models.Session.destroy({ where: { siteId: site.id, tokenHash: tokenHash(previous) }, transaction });
				}
				return { reader: readerDto(identity), cookie: await sessions.issue(identity, site.id, transaction) };
			});
		},
		async reader(req, site, required = false) {
			const session = await sessions.read(req, site.id);
			const identity = session ? await models.Identity.findByPk(session.identityId) : null;
			const user = identity ? await app.ms.database.models.User.findByPk(identity.userId) : null;
			if ((!identity || !user || identity.userId !== session.userId) && required) {
				siteProblem(401, 'reader_login_required');
			}
			return identity && user && identity.userId === session.userId ? readerDto(identity) : null;
		}
	};
}
function readerDto(identity) {
	return { id: identity.id, userId: identity.userId, email: identity.email, name: identity.name };
}
