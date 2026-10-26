import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {DataTypes, Op} from 'sequelize';
import {ApiProblemError, sendApiProblem} from './problem.js';

export function siteProblem(status, code): never {
	throw new ApiProblemError(status, code, code, code);
}

export async function configuredSite(app, req, mutation = false) {
	const host = String(req.headers?.host || '').toLowerCase();
	const site = await app.ms.membership?.resolveSite(host);
	if (!site) {
		siteProblem(404, 'membership_site_not_found');
	}
	if ((req.headers.origin && req.headers.origin !== site.origin)
		|| req.headers['sec-fetch-site'] === 'cross-site'
		|| (mutation && req.headers.origin !== site.origin)) {
		siteProblem(403, 'origin_invalid');
	}
	return site;
}

export function noStore(res) {
	res.setHeader('Cache-Control', 'no-store');
	res.setHeader('Vary', 'Cookie, Host');
}

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
export function browserCookie(name, token, maxAge) {
	return `${name}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function readBrowserCookie(req, name) {
	const header = String(req.headers?.cookie || '');
	if (header.length > 8192) {
		return null;
	}
	const values = header.split(';').map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
	if (values.length !== 1) {
		return null;
	}
	const value = values[0].slice(name.length + 1);
	return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export async function defineBrowserSessions(sequelize) {
	const Session = sequelize.define('browserSession', {
		id: {type: DataTypes.UUID, primaryKey: true},
		identityId: {type: DataTypes.UUID, allowNull: false},
		userId: {type: DataTypes.INTEGER, allowNull: false},
		siteId: {type: DataTypes.STRING(30), allowNull: false},
		tokenHash: {type: DataTypes.STRING(64), allowNull: false, unique: true},
		expiresAt: {type: DataTypes.DATE, allowNull: false}
	}, {indexes: [{fields: ['expiresAt']}, {fields: ['userId', 'siteId']}]});
	await Session.sync({});
	return Session;
}

export function browserSessions(Session, clock = () => new Date()) {
	const name = '__Host-geesome_session';
	return {
		async issue(identity, siteId, transaction) {
			const token = opaqueToken();
			await Session.create({id: randomUUID(), identityId: identity.id, userId: identity.userId, siteId,
				tokenHash: tokenHash(token), expiresAt: new Date(clock().getTime() + 30 * 86400000)}, {transaction});
			return browserCookie(name, token, 30 * 86400);
		},
		async read(req, siteId) {
			const token = readBrowserCookie(req, name);
			if (!token) {
				return null;
			}
			return Session.findOne({where: {siteId, tokenHash: tokenHash(token), expiresAt: {[Op.gt]: clock()}}});
		},
		async logout(req, siteId) {
			const token = readBrowserCookie(req, name);
			if (token) {
				await Session.destroy({where: {siteId, tokenHash: tokenHash(token)}});
			}
			return browserCookie(name, '', 0);
		}
	};
}

export function creatorSiteEndpoint(handler) {
	return async (req, res) => {
		noStore(res);
		try {
			return await handler(req, res);
		} catch (error) {
			if (error instanceof ApiProblemError || (error instanceof Error && error.message === 'not_permitted')) {
				return sendApiProblem(res, error, req.requestId);
			}
			console.error('creator_site_request_failed');
			return sendApiProblem(res, new ApiProblemError(500, 'creator_site_unavailable', 'Creator site unavailable'), req.requestId);
		}
	};
}
