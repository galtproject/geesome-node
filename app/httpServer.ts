import type {Server} from 'node:http';

export function closeHttpServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			server.close((error?: Error) => {
				if (error && (error as any).code !== 'ERR_SERVER_NOT_RUNNING') {
					reject(error);
					return;
				}
				resolve();
			});
			server.closeIdleConnections?.();
		} catch (error) {
			if ((error as any)?.code === 'ERR_SERVER_NOT_RUNNING') {
				resolve();
				return;
			}
			reject(error);
		}
	});
}
