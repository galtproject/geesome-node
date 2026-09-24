import {CorePermissionName, IUserApiKey} from '../database/interface.js';
import {ApiProblemError} from './problem.js';

const SCOPE_PERMISSION_MAP = {
	'assets:write': CorePermissionName.UserSaveData,
	'assets:read-private': CorePermissionName.UserSaveData,
	'content:write': CorePermissionName.UserSaveData,
	'operations:read': CorePermissionName.UserSaveData,
	'asset-batches:write': CorePermissionName.UserSaveData
};

export function normalizeIntegrationScopes(value: any): string[] {
	const scopes = parseStringList(value);
	for (const scope of scopes) {
		if (!SCOPE_PERMISSION_MAP[scope]) {
			throw new ApiProblemError(400, 'integration_scope_invalid', 'Invalid integration scope', `Unknown integration scope: ${scope}`);
		}
	}
	return Array.from(new Set(scopes)).sort();
}

export function getScopePermissions(scopes: string[]): string[] {
	return Array.from(new Set(scopes.map(scope => SCOPE_PERMISSION_MAP[scope])));
}

export function getApiKeyScopes(apiKey: IUserApiKey): string[] {
	const explicit = parseStringList(apiKey?.scopes);
	if (explicit.length) {
		return explicit.sort();
	}
	const permissions = parseStringList(apiKey?.permissions);
	return Object.entries(SCOPE_PERMISSION_MAP)
		.filter(([, permission]) => permissions.includes(permission) || permissions.includes(CorePermissionName.UserAll))
		.map(([scope]) => scope)
		.sort();
}

export function requireIntegrationScopes(apiKey: IUserApiKey, requiredScopes: string[]) {
	const granted = getApiKeyScopes(apiKey);
	const missing = requiredScopes.filter(scope => !granted.includes(scope));
	if (missing.length) {
		throw new ApiProblemError(403, 'insufficient_scope', 'Insufficient scope', 'The API key does not grant every scope required by this operation.', {
			requiredScopes,
			grantedScopes: granted
		});
	}
}

export function serializeApiKey(apiKey: any) {
	const data = typeof apiKey?.toJSON === 'function' ? apiKey.toJSON() : apiKey || {};
	return {
		id: data.id,
		title: data.title || null,
		type: data.type || null,
		scopes: getApiKeyScopes(data),
		createdAt: data.createdAt || null,
		updatedAt: data.updatedAt || null,
		lastUsedAt: data.lastUsedAt || null,
		expiresAt: data.expiredOn || null,
		revoked: data.isDisabled === true
	};
}

function parseStringList(value: any): string[] {
	if (Array.isArray(value)) {
		return value.map(item => String(item).trim()).filter(Boolean);
	}
	if (!value) {
		return [];
	}
	if (typeof value === 'string') {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.map(item => String(item).trim()).filter(Boolean);
			}
		} catch (e) {
			return value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean);
		}
	}
	return [];
}
