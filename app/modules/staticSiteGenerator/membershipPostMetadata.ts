export function readMembershipPostMetadata(post) {
	try {
		return JSON.parse(post.propertiesJson || '{}').membership || null;
	} catch {
		return null;
	}
}
