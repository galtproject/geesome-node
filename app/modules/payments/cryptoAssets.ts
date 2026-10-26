export type CryptoNetwork = 'ethereum' | 'arbitrum' | 'base' | 'tron' | 'bitcoin';
export const cryptoNetworks = {
	ethereum: { label: 'Ethereum', family: 'evm', chainId: 1 },
	arbitrum: { label: 'Arbitrum One', family: 'evm', chainId: 42161 },
	base: { label: 'Base', family: 'evm', chainId: 8453 },
	tron: { label: 'TRON', family: 'tron', chainId: 728126428 },
	bitcoin: { label: 'Bitcoin', family: 'bitcoin', chainId: null },
} as const;
export const cryptoAssets = [
	{ id: 'eth-ethereum', currency: 'ETH', network: 'ethereum', decimals: 18, contract: null, rateId: 'ethereum' },
	{ id: 'eth-arbitrum', currency: 'ETH', network: 'arbitrum', decimals: 18, contract: null, rateId: 'ethereum' },
	{ id: 'eth-base', currency: 'ETH', network: 'base', decimals: 18, contract: null, rateId: 'ethereum' },
	{ id: 'usdt-ethereum', currency: 'USDT', network: 'ethereum', decimals: 6, contract: '0xdac17f958d2ee523a2206206994597c13d831ec7', rateId: 'tether' },
	{ id: 'usdt-arbitrum', currency: 'USDT', network: 'arbitrum', decimals: 6, contract: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', rateId: 'tether' },
	{ id: 'usdc-base', currency: 'USDC', network: 'base', decimals: 6, contract: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', rateId: 'usd-coin' },
	{ id: 'usdt-tron', currency: 'USDT', network: 'tron', decimals: 6, contract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', rateId: 'tether' },
	{ id: 'btc-bitcoin', currency: 'BTC', network: 'bitcoin', decimals: 8, contract: null, rateId: 'bitcoin' },
] as const;
export type CryptoAsset = typeof cryptoAssets[number];
export function cryptoAsset(id: string): CryptoAsset {
	const asset = cryptoAssets.find(a => a.id === id);
	if (!asset) {
		throw Error('crypto_asset_invalid');
	}
	return asset;
}
