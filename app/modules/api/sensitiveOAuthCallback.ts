// Authorization codes and state must stay out of optional request access logs.
export function isSensitiveOAuthCallback(value: any) {
	return typeof value === 'string' && /^\/(?:api\/)?v1\/user\/social-publications\/deviantart\/oauth\/callback\/?$/i.test(value.split('?')[0]);
}
