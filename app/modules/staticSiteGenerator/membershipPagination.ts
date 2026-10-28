export const creatorPageSize = 10;
export type CreatorLayout = {archives: string[][]; home: string[]};
// Assignments outlive visibility changes. Never compact an archive after removal.
export function creatorLayout(posts, previous?: CreatorLayout): CreatorLayout {
	const layout = previous ? {archives: previous.archives.map(ids => [...ids]), home: [...previous.home]} : {archives: [], home: []};
	const known = new Set([...layout.archives.flat(), ...layout.home]);
	const visible = new Set<string>(posts.map(post => String(post.id)));
	const ordered = [...posts].sort((a, b) => (a.date || 0) - (b.date || 0) || Number(a.id) - Number(b.id));
	for (const post of ordered) {
		const id = String(post.id);
		if (!known.has(id)) {
			layout.home.push(id);
			known.add(id);
		}
	}
	while (layout.home.filter(id => visible.has(id)).length >= creatorPageSize * 2) {
		const archived = layout.home.filter(id => visible.has(id)).slice(0, creatorPageSize);
		const moved = new Set(archived);
		layout.archives.push(archived);
		layout.home = layout.home.filter(id => !moved.has(id));
	}
	return layout;
}
export function creatorPagePaths(layout: CreatorLayout) {
	return ['index.html', ...layout.archives.map((_ids, index) => `page/${index + 1}/index.html`)];
}
