import {IGeesomeApp} from '../../interface.js';

export function getPublicApiContext(app: IGeesomeApp, version = 'v1', port?: number | string) {
	const configuredValue = app.config?.apiConfig?.publicUrl;
	const configuredUrl = normalizePublicUrl(configuredValue);
	if (configuredValue && !configuredUrl) {
		throw new Error('GEESOME_PUBLIC_URL must be an absolute http or https URL without credentials, query, or fragment');
	}
	const publicUrl = configuredUrl || `http://127.0.0.1:${port || app.ms.api?.port || 2052}`;
	const configuredBasePath = String(app.config?.apiConfig?.publicBasePath || `/api/${version}`);
	const basePath = configuredBasePath.replace(/\{version\}/g, version).replace(/\/+$/, '');
	return {
		publicUrl,
		apiBaseUrl: `${publicUrl}${basePath.startsWith('/') ? '' : '/'}${basePath}`
	};
}

function normalizePublicUrl(value): string | null {
	try {
		const url = new URL(String(value || '').trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
			return null;
		}
		return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
	} catch (e) {
		return null;
	}
}
