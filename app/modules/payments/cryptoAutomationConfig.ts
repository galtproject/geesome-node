import { createRequire } from 'node:module';
const defaults: AutomationConfig = createRequire(import.meta.url)('./config/direct-crypto.json');
export const evmNetworks = ['ethereum', 'arbitrum', 'base'] as const;
export type EvmNetwork = (typeof evmNetworks)[number];
export interface AutomationConfig {
	feeSampleIntervalMs: number;
	feeHistoryMs: number;
	transferThresholdCents: number;
	serviceLowCents: number;
	serviceRefillCents: number;
	rpcRefreshMs: number;
	rpcTimeoutMs: number;
	rpcFailureCooldownMs: number;
	maxSwapFeeCents: number;
	gasSafetyPercent: number;
	rpcMaxAttempts: number;
	workerIntervalMs: number;
	erc20BenchmarkGas: number;
	collectionRetryIntervalMs: number;
	slippagePercent: number;
	rpcCacheFile: string;
	chainlistUrl: string;
	oneInchUrl: string;
	oneInchRouter: string;
	networks: EvmNetwork[];
}
export function automationConfig(env: NodeJS.ProcessEnv = process.env) {
	const config = { ...defaults };
	if (env.DIRECT_CRYPTO_CONFIG) {
		let override;
		try {
			override = JSON.parse(env.DIRECT_CRYPTO_CONFIG);
		}
		catch {
			throw Error('crypto_config_invalid');
		}
		if (!override ||
			typeof override !== 'object' ||
			Array.isArray(override) ||
			Object.keys(override).some((k) => !(k in defaults))) {
			throw Error('crypto_config_invalid');
		}
		Object.assign(config, override);
	}
	for (const name of [
		'feeSampleIntervalMs',
		'feeHistoryMs',
		'transferThresholdCents',
		'serviceLowCents',
		'serviceRefillCents',
		'rpcRefreshMs',
		'rpcTimeoutMs',
		'rpcFailureCooldownMs',
		'maxSwapFeeCents',
		'gasSafetyPercent',
		'rpcMaxAttempts',
		'workerIntervalMs',
		'erc20BenchmarkGas',
		'collectionRetryIntervalMs',
	] as const)
		if (!Number.isSafeInteger(config[name]) || config[name] <= 0) {
			throw Error('crypto_config_invalid');
		}
	if (typeof config.slippagePercent !== 'number' || !Number.isFinite(config.slippagePercent)) {
		throw Error('crypto_config_invalid');
	}
	if (!Array.isArray(config.networks)) {
		throw Error('crypto_config_invalid');
	}
	if (new Set(config.networks).size !== config.networks.length) {
		throw Error('crypto_config_invalid');
	}
	if (config.serviceRefillCents <= config.serviceLowCents ||
		config.gasSafetyPercent < 100 ||
		config.slippagePercent <= 0 ||
		config.slippagePercent > 5 ||
		config.feeSampleIntervalMs > config.feeHistoryMs ||
		!Array.isArray(config.networks) ||
		!config.networks.length ||
		config.networks.some((n) => !evmNetworks.includes(n))) {
		throw Error('crypto_config_invalid');
	}
	return config;
}
