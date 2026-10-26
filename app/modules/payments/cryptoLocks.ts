import type { Sequelize, Transaction } from 'sequelize';
// Stable PostgreSQL keys shared by every process operating on this ledger.
const keys = { allocation: 731904201, receipts: 731904202, collection: 731904203 } as const;
export function lockCryptoAllocation(sequelize: Sequelize, transaction: Transaction) {
	return sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
		replacements: { key: keys.allocation },
		transaction,
	});
}
export function lockCryptoReceipts(sequelize: Sequelize, transaction: Transaction) {
	return sequelize.query('SELECT pg_advisory_xact_lock(:key)', {
		replacements: { key: keys.receipts },
		transaction,
	});
}
export async function withCryptoCollectionLock(sequelize: Sequelize, work: () => Promise<void>) {
	// The session lock must be acquired and released on the same dedicated connection.
	const connection = (await sequelize.connectionManager.getConnection({
		type: 'write',
		useMaster: true,
	})) as {
		query(sql: string, values: number[]): Promise<{
			rows: {
				acquired: boolean;
			}[];
		}>;
	};
	let acquired = false;
	try {
		const result = await connection.query('SELECT pg_try_advisory_lock($1) AS acquired', [
			keys.collection,
		]);
		acquired = result.rows[0].acquired;
		if (acquired) {
			await work();
		}
	}
	finally {
		if (acquired) {
			await connection.query('SELECT pg_advisory_unlock($1)', [keys.collection]);
		}
		await sequelize.connectionManager.releaseConnection(connection);
	}
}
