import { Op } from 'sequelize';
import type { TransactionRequest } from 'ethers-v6';
import type { EvmNetwork } from './cryptoAutomationConfig.js';
import type { createEvmAdapter } from './cryptoEvm.js';
export interface TokenTransferProof {
	contract: string;
	to: string;
	amount: string;
}
interface TransferLog {
	address: string;
	topics?: string[];
	data: string;
}
type JournalAdapter = Pick<ReturnType<typeof createEvmAdapter>, 'prepare' | 'balance' | 'receipt' | 'broadcast'>;
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
function verifiesTokenTransfer(logs: TransferLog[], sender: string, proof: TokenTransferProof) {
	return logs.some((log) => String(log.address).toLowerCase() === proof.contract &&
		log.topics?.length === 3 &&
		log.topics[0].toLowerCase() === transferTopic &&
		log.topics[1].toLowerCase() === '0x' + sender.slice(2).padStart(64, '0') &&
		log.topics[2].toLowerCase() === '0x' + proof.to.slice(2).padStart(64, '0') &&
		BigInt(log.data) === BigInt(proof.amount));
}
export function safeError(error: unknown): string {
	const message = (error as {
		message?: unknown;
	} | null)?.message;
	return typeof message === 'string' && /^crypto_[a-z_]+$/.test(message)
		? message
		: 'crypto_collection_unavailable';
}
export function createCryptoTransactionJournal({ M, evm }: {
	M: any;
	evm: JournalAdapter;
}) {
	async function send(network: EvmNetwork, id: string, index: number, request: TransactionRequest, proof?: TokenTransferProof, maxFee?: bigint) {
		let tx = await M.crypto_transactions.findByPk(id);
		if (!tx) {
			const signed = await evm.prepare(network, index, request);
			if (maxFee !== undefined && BigInt(signed.fee) > maxFee) {
				throw Error('crypto_fee_changed');
			}
			const amount = BigInt(request.value || 0);
			if ((await evm.balance(network, signed.sender)) < amount + BigInt(signed.fee)) {
				throw Error(index === 0 ? 'crypto_service_needs_native_funding' : 'crypto_deposit_needs_gas');
			}
			tx = await M.crypto_transactions.create({
				id,
				network,
				hash: signed.hash,
				sender: signed.sender,
				nonce: signed.nonce,
				raw: signed.raw,
				state: 'prepared',
				data: { fee: signed.fee, request: signed.request, proof },
			});
		}
		if (tx.state === 'failed') {
			throw Error('crypto_transaction_failed');
		}
		if (tx.state === 'confirmed') {
			return true;
		}
		const receipt = await evm.receipt(network, tx.hash);
		if (receipt) {
			if (!receipt.ok) {
				await tx.update({ state: 'failed', data: { ...tx.data, balanceReceipt: receipt.receipt } });
				throw Error('crypto_transaction_failed');
			}
			if (tx.data.proof &&
				!verifiesTokenTransfer(receipt.receipt.logs || [], tx.sender, tx.data.proof)) {
				await tx.update({ state: 'failed', data: { ...tx.data, balanceReceipt: receipt.receipt } });
				throw Error('crypto_token_transfer_unverified');
			}
			await tx.update({ state: 'confirmed', data: { ...tx.data, balanceReceipt: receipt.receipt } });
			return true;
		}
		// Includes "already known" and lost responses: reconcile this exact hash next time.
		try {
			await evm.broadcast(network, tx.raw);
			await tx.update({ state: 'broadcast' });
		}
		catch {
			await tx.update({ state: 'broadcast' });
		}
		return false;
	}
	async function pending(network: EvmNetwork) {
		const tx = await M.crypto_transactions.findOne({
			where: { network, state: { [Op.in]: ['prepared', 'broadcast'] } },
			order: [['createdAt', 'ASC']],
		});
		if (!tx) {
			return false;
		}
		try {
			await send(network, tx.id, 0, {});
		}
		catch (error) {
			const code = safeError(error);
			if (!['crypto_transaction_failed', 'crypto_token_transfer_unverified'].includes(code)) {
				throw error;
			}
			const job = await M.crypto_collections.findByPk(tx.id.split(':')[0]);
			if (job) {
				await job.update({ state: 'action_required', lastError: code });
			}
		}
		return true;
	}
	return { send, pending };
}
