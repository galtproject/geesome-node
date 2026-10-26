import type { CryptoAsset } from './cryptoAssets.js';
import type { EvmNetwork } from './cryptoAutomationConfig.js';
export interface CollectionInput {
	resourceId: string;
	assetId: string;
	index: number;
	fingerprint: string;
	amount: string;
	retryAt?: number | null;
}
export interface CollectionPlan extends CollectionInput {
	payout: string;
	reserve: string;
	remainder: string;
	transferFee: string;
}
export type CollectionState = 'new' | 'reserve' | 'payout' | 'swap' | 'done' | 'action_required';
interface CollectionUpdate {
	state?: CollectionState;
	data?: CollectionInput | CollectionPlan;
	lastError?: string | null;
}
// Sequelize records enter through the model boundary; active states narrow their data here.
export type CryptoCollection = {
	[S in CollectionState]: {
		id: string;
		network: EvmNetwork;
		state: S;
		data: S extends 'new' ? CollectionInput : S extends 'done' | 'action_required' ? CollectionInput | CollectionPlan : CollectionPlan;
		update(values: CollectionUpdate): Promise<unknown>;
	};
}[CollectionState];
export type CollectionInState<S extends CollectionState> = Extract<CryptoCollection, {
	state: S;
}>;
export interface CollectionContext {
	n: EvmNetwork;
	asset: CryptoAsset;
	price: string;
	deposit: string;
	service: string;
}
