export async function readBoundedText(response: Response, { limitBytes = 8 * 1024 * 1024, timeoutMs = 15000 }: {
	limitBytes?: number;
	timeoutMs?: number;
} = {}) {
	if (!response.body) {
		throw Error('geesome_body_missing');
	}
	const reader = response.body.getReader();
	let timer: any;
	let bytes = 0;
	const parts: Uint8Array[] = [];
	const timeout = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { reject(Error('geesome_body_timeout')); void reader.cancel().catch(() => { }); }, timeoutMs); });
	try {
		if (Number(response.headers.get('content-length') || 0) > limitBytes) {
			throw Error('geesome_body_too_large');
		}
		return await Promise.race([(async () => {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					bytes += value.byteLength;
					if (bytes > limitBytes) {
						throw Error('geesome_body_too_large');
					}
					parts.push(value);
				}
				return Buffer.concat(parts).toString('utf8');
			})(), timeout]);
	}
	finally {
		clearTimeout(timer);
		void reader.cancel().catch(() => { });
	}
}
