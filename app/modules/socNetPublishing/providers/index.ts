import {createTransport, check, validatePayload} from './common.js';
import {createBlueskyProvider} from './bluesky.js';
import {createDiscordProvider} from './discord.js';
import {createTelegramProvider} from './telegram.js';

export {ServerPublicationError} from './common.js';

export function createServerProviders(options: {fetch?: typeof fetch; loadMedia?: any} = {}) {
	const transport = createTransport(options.fetch);
	const providers = {bluesky: createBlueskyProvider(transport), discord: createDiscordProvider(transport), telegram: createTelegramProvider(transport)};
	function provider(network: string) {
		check(Object.hasOwn(providers, network), 'Server publication network is unsupported');
		return providers[network];
	}
	return {
		verify(network: string, credentials: any, target: any = {}) {
			return provider(network).verify(credentials, target);
		},
		publish(network: string, account: any, payload: any, loadMedia = options.loadMedia) {
			const adapter = provider(network);
			validatePayload(network, payload);
			return adapter.publish(account, payload, loadMedia);
		}
	};
}
