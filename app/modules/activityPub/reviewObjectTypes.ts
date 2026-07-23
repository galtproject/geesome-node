export const activityPubReviewObjectTypes = new Set([
	'Note',
	'Article',
	'Page',
	'Image',
	'Video',
	'Audio',
	'Document',
	'Question',
	'Event'
]);

export function isActivityPubReviewObjectType(objectType): boolean {
	return typeof objectType === 'string'
		&& activityPubReviewObjectTypes.has(objectType);
}
