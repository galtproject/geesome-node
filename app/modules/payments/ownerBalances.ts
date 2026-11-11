import {cryptoAssets, cryptoAsset} from './cryptoAssets.js';
import {displayAtomic} from './cryptoAmounts.js';

const staleAfterMs = 24 * 3600000;
/** Database-only owner views; Snapshots are recorded by payment/transfer events, never by view requests. */
export function createOwnerBalances({M, resource, clock, networks}) {
	const db = M.crypto_runtime.sequelize;
	const quote = model => db.getQueryInterface().queryGenerator.quoteTable(model.getTableName());
	const assets = cryptoAssets.map(a => `('${a.id}', '${a.network}')`).join(',');
	const targets = `WITH assets("assetId", network) AS (VALUES ${assets}), payment_accounts AS (
		SELECT "resourceId", "readerId", "addressId", "assetId" FROM ${quote(M.crypto_accounts)}
		UNION SELECT "resourceId", "readerId", "addressId", "assetId" FROM ${quote(M.crypto_invoices)}
	), targets AS (
		SELECT p."resourceId", p."readerId", a.address, p."assetId", a.network, 'user' AS kind
		FROM payment_accounts p JOIN ${quote(M.crypto_addresses)} a ON a.id::text = p."addressId"
		JOIN assets x ON x."assetId" = p."assetId" AND x.network = a.network
		UNION
		SELECT r.id, '', LOWER(COALESCE(NULLIF(t.payout, ''), NULLIF(o.payout, ''))), x."assetId", x.network, 'owner'
		FROM ${quote(M.resources)} r LEFT JOIN ${quote(M.crypto_treasuries)} t ON t.id = r.id
		LEFT JOIN ${quote(M.owner_payouts)} o ON o."userId" = r."ownerId" CROSS JOIN assets x
		WHERE COALESCE(NULLIF(t.payout, ''), NULLIF(o.payout, '')) IS NOT NULL AND x.network IN (:networks)
	), keyed AS (SELECT *, 'wallet-observation:' || md5(network || ':' || LOWER(address) || ':' || "assetId") AS key FROM targets)`;
	const params = {networks: networks.length ? networks : ['none']};
	function observation(data, asset) {
		const observedAt = data?.observedAt || null;
		const valid = typeof data?.amountAtomic === 'string' && /^\d{1,100}$/.test(data.amountAtomic) && Number.isFinite(Date.parse(observedAt));
		return {amount: valid ? displayAtomic(data.amountAtomic, asset.decimals) : null, observedAt: valid ? observedAt : null, blockHeight:data?.blockHeight || null,
			stale: !valid || Date.parse(observedAt) > clock().getTime() || clock().getTime() - Date.parse(observedAt) > staleAfterMs || Boolean(data?.error),
			error: data?.error ? 'balance_check_failed' : null};
	}
	async function read(id, input: any = {}) {
		await resource(id);
		const offset = Math.max(0, Math.min(100000, Math.trunc(Number(input.offset) || 0)));
		const [rows] = await db.query(`${targets} SELECT k.*, CASE WHEN c.snapshot->'checkpoint'->'latest'->>'balance' IS NOT NULL
                 AND COALESCE((c.snapshot->'checkpoint'->'latest'->>'height')::numeric,0) > GREATEST(COALESCE((s.data->>'blockHeight')::numeric,-1),COALESCE((s.data->>'failedBlockHeight')::numeric,-1))
                 THEN jsonb_build_object('amountAtomic',c.snapshot->'checkpoint'->'latest'->>'balance','observedAt',c.snapshot->>'observedAt','blockHeight',c.snapshot->'checkpoint'->'latest'->>'height') ELSE s.data END AS data,
			c."receivedAtomic", c."consumedAtomic", c.snapshot->>'observedAt' AS "creditObservedAt", c."lastError" AS "creditError"
			FROM keyed k LEFT JOIN ${quote(M.crypto_runtime)} s ON s.id = k.key
			LEFT JOIN ${quote(M.crypto_accounts)} c ON k.kind = 'user' AND c."resourceId" = k."resourceId"
			 AND c."readerId" = k."readerId" AND c."assetId" = k."assetId" AND c."addressId" IN
			 (SELECT id::text FROM ${quote(M.crypto_addresses)} WHERE address = k.address AND network = k.network)
			WHERE k."resourceId" = :id ORDER BY k.kind, k."readerId", k.address, k."assetId" LIMIT 21 OFFSET :offset`, {replacements:{...params,id,offset}});
		return {source:'database', staleAfterSeconds: staleAfterMs / 1000, offset, hasMore:rows.length > 20, balances:rows.slice(0,20).map(row => {
			const asset = cryptoAsset(row.assetId);
			const available = row.receivedAtomic === null ? null : BigInt(row.receivedAtomic) - BigInt(row.consumedAtomic);
			return {kind:row.kind,readerId:row.readerId || null,address:row.address,assetId:asset.id,currency:asset.currency,network:asset.network,
				availableCredit:available === null ? null : displayAtomic(String(available > 0n ? available : 0n),asset.decimals),
				creditObservedAt:row.creditObservedAt || null,creditError:Boolean(row.creditError),wallet:observation(row.data,asset)};
		})};
	}
	return {read};
}
