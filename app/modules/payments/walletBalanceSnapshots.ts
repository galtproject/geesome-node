import {createHash} from 'node:crypto';
import {cryptoAssets} from './cryptoAssets.js';

const key = (network, address, assetId) => 'wallet-observation:' + createHash('md5').update(`${network}:${address.toLowerCase()}:${assetId}`).digest('hex');
/** Save an operation-block balance; an older scan must never overwrite a newer transfer snapshot. */
export async function saveWalletSnapshot(M, {network,address,assetId,amountAtomic,blockHeight,observedAt,error=null}, transaction?) {
	if (!/^\d{1,100}$/.test(String(blockHeight)) || !/^\d{1,100}$/.test(String(amountAtomic)) || !Number.isFinite(Date.parse(observedAt))) {
		throw Error('crypto_balance_evidence_invalid');
	}
	const db=M.crypto_runtime.sequelize, table=db.getQueryInterface().queryGenerator.quoteTable(M.crypto_runtime.getTableName());
	await db.query(`INSERT INTO ${table} (id,data,"createdAt","updatedAt") VALUES (:id,CAST(:data AS jsonb),NOW(),NOW())
		ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,"updatedAt"=NOW()
		WHERE GREATEST(COALESCE((${table}.data->>'blockHeight')::numeric,-1),COALESCE((${table}.data->>'failedBlockHeight')::numeric,-1)) <= :height`, {transaction,replacements:{id:key(network,address,assetId),height:String(blockHeight),
		data:JSON.stringify({amountAtomic:String(amountAtomic),blockHeight:String(blockHeight),observedAt,error})}});
}
/** Only after a verified receipt. Balance reads use its block, never latest or periodic polling. */
export async function recordTransferBalances(M,evm,tx,receipt,clock=()=>new Date()) {
	const height=BigInt(receipt.blockNumber).toString(), tag='0x'+BigInt(height).toString(16);
	const proof=tx.data.proof, to=proof?.to || tx.data.request?.to;
	const asset=proof ? cryptoAssets.find(a=>a.network===tx.network && a.contract?.toLowerCase()===String(proof.contract).toLowerCase())
		: cryptoAssets.find(a=>a.network===tx.network && !a.contract);
	if (!asset || !to) {
		throw Error('crypto_balance_evidence_invalid');
	}
	const targets=[{address:tx.sender,asset},{address:to,asset}];
	if (asset.contract) {
		targets.push({address:tx.sender,asset:cryptoAssets.find(a=>a.network===tx.network&&!a.contract)!});
	}
	for (const target of targets) {
		try {
			const amount=await evm.balance(tx.network,target.address,target.asset.id,tag);
			await saveWalletSnapshot(M,{network:tx.network,address:target.address,assetId:target.asset.id,amountAtomic:String(amount),blockHeight:height,observedAt:clock().toISOString()});
		} catch {
			// A confirmed payment must stay confirmed even if the optional snapshot cannot be read.
			const db=M.crypto_runtime.sequelize, table=db.getQueryInterface().queryGenerator.quoteTable(M.crypto_runtime.getTableName());
			await db.query(`INSERT INTO ${table} (id,data,"createdAt","updatedAt") VALUES (:id,CAST(:data AS jsonb),NOW(),NOW())
				ON CONFLICT (id) DO UPDATE SET data=${table}.data || EXCLUDED.data,"updatedAt"=NOW()
				WHERE GREATEST(COALESCE((${table}.data->>'blockHeight')::numeric,-1),COALESCE((${table}.data->>'failedBlockHeight')::numeric,-1)) <= :height`, {replacements:{id:key(tx.network,target.address,target.asset.id),height,
				data:JSON.stringify({error:'balance_check_failed',failedBlockHeight:height})}});
		}
	}
}
