export type GuestSelection = {origin: string; location: string};
let sequence = 0;

/** Process-local public redirects only. HTTP responses remain private/no-store. */
export function createGuestSelectionCache(models: any[], now = () => Date.now(), ttlMs = 1000, maxEntries = 256) {
	const entries = new Map<string, {pending?: Promise<GuestSelection>; value?: GuestSelection; expires: number}>();
	const transactions = new WeakSet<object>();
	const hooks: {model: any; event: string}[] = [];
	const name = `membership-guest-selection-${++sequence}`;
	const invalidate = () => entries.clear();
	function changed(options) {
		const transaction = options?.transaction;
		if (!transaction) {
			invalidate();
			return;
		}
		if (!transactions.has(transaction)) {
			transactions.add(transaction);
			transaction.afterCommit(invalidate);
		}
	}
	for (const model of new Set(models.filter(Boolean))) {
		if (!model.addHook) {
			continue;
		}
		for (const event of ['afterSave', 'afterDestroy', 'afterBulkUpdate', 'afterBulkDestroy', 'afterBulkCreate', 'afterUpsert']) {
			model.addHook(event, name, (...args) => changed(['afterBulkUpdate', 'afterBulkDestroy'].includes(event) ? args[0] : args[1]));
			hooks.push({model, event});
		}
	}
	return {
		async get(key: string, load: () => Promise<GuestSelection>): Promise<GuestSelection> {
			const cached = entries.get(key);
			if (cached && cached.expires > now()) {
				entries.delete(key);
				entries.set(key, cached);
				return cached.pending || cached.value!;
			}
			entries.delete(key);
			const entry: {pending?: Promise<GuestSelection>; value?: GuestSelection; expires: number} = {expires: now() + ttlMs};
			entries.set(key, entry);
			while (entries.size > maxEntries) {
				entries.delete(entries.keys().next().value);
			}
			entry.pending = Promise.resolve().then(load).then(value => {
				// Commit invalidation or eviction must fence off an older in-flight load.
				if (entries.get(key) === entry && entry.expires > now()) {
					entry.value = {origin: value.origin, location: value.location};
					entry.pending = undefined;
				} else if (entries.get(key) === entry) {
					entries.delete(key);
				}
				return value;
			}, error => {
				if (entries.get(key) === entry) {
					entries.delete(key);
				}
				throw error;
			});
			return entry.pending;
		},
		stop() {
			invalidate();
			for (const {model, event} of hooks) {
				model.removeHook(event, name);
			}
		}
	};
}

export function isGuestSelectionRequest(headers: Record<string, any>) {
	return !headers.authorization && !/(?:^|;)\s*__Host-geesome_session(?:=|;|$)/.test(String(headers.cookie || ''));
}
