import { DataTypes } from 'sequelize';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { cryptoSchema } = require('./cryptoSchema.cjs');
const { cryptoAutomationSchema } = require('./cryptoAutomationSchema.cjs');
export default async function (sequelize) {
  const id = { type: DataTypes.UUID, primaryKey: true, allowNull: false };
  const str = (size = 200) => ({ type: DataTypes.STRING(size), allowNull: false });
  const definitions = {
    owner_payouts: { userId: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false }, payout: str(42), version: { type: DataTypes.INTEGER, allowNull: false } },
    payout_addresses: { address: { ...str(42), primaryKey: true } },
    crypto_accounts: { id: { ...str(100), primaryKey: true }, resourceId: str(30), readerId: str(), addressId: str(), assetId: str(30), snapshot: { type: DataTypes.JSONB, allowNull: false }, receivedAtomic: str(100), consumedAtomic: str(100), activeInvoiceId: { type: DataTypes.UUID }, nextCheckAt: { type: DataTypes.DATE, allowNull: false }, lastError: { type: DataTypes.STRING(100) }, scanLease: { type: DataTypes.UUID }, scanLeaseUntil: { type: DataTypes.DATE } },
    crypto_deposits: { id: { ...str(), primaryKey: true }, accountId: str(100), amountAtomic: str(100), proof: { type: DataTypes.JSONB, allowNull: false } },
    crypto_credits: { id, accountId: str(100), invoiceId: { ...str(), unique: true }, amountAtomic: str(100) },
    invoices: { id, resourceId: str(30), readerId: str(), requestKey: { ...str(), unique: true }, optionSnapshot: { type: DataTypes.JSONB, allowNull: false }, status: str(30), providerId: { type: DataTypes.STRING, unique: true }, checkoutUrl: { type: DataTypes.TEXT }, paidAt: { type: DataTypes.DATE } },
    refunds: { id, resourceId: str(30), readerId: str(), invoiceId: { ...str(), unique: true }, requestKey: { ...str(), unique: true }, reason: { type: DataTypes.TEXT }, decisionReason: { type: DataTypes.TEXT }, decidedBy: { type: DataTypes.STRING }, status: str(30) },
    ...cryptoSchema(DataTypes), ...cryptoAutomationSchema(DataTypes)
  };
  const indexes = {
    owner_payouts: [{ fields: ['payout'] }],
    crypto_accounts: [{ fields: ['resourceId', 'readerId', 'updatedAt'] }, { fields: ['nextCheckAt'] }, { fields: ['addressId', 'assetId'], unique: true }],
    crypto_deposits: [{ fields: ['accountId', 'createdAt'] }],
    crypto_credits: [{ fields: ['accountId', 'createdAt'] }],
    invoices: [{ fields: ['resourceId', 'readerId', 'createdAt'] }],
    refunds: [{ fields: ['resourceId', 'createdAt'] }],
    crypto_wallets: [{ fields: ['resourceId', 'network'], unique: true }],
    crypto_invoices: [{ fields: ['status', 'nextCheckAt'] }],
    crypto_hd_accounts: [{ name: 'payments_hd_accounts_resource_unique', fields: ['walletFingerprint', 'readerId', 'resourceId'], unique: true }, { fields: ['walletFingerprint', 'index'], unique: true }],
    crypto_transactions: [{ fields: ['network', 'sender', 'nonce'], unique: true }],
    crypto_collections: [{ fields: ['state', 'createdAt'] }]
  };
  const models: any = {};
  for (const [name, fields] of Object.entries(definitions)) {
    models[name] = sequelize.define(`payments_${name}`, fields, { tableName: `payments_${name}`, indexes: indexes[name] || [] });
    await models[name].sync({});
  }
  models.crypto_invoices.hasOne(models.crypto_collections, { as: 'collection', foreignKey: 'invoiceId', sourceKey: 'id', constraints: false });
  models.crypto_transfers.latestConfirmedHeight = async (addressId, assetId, transaction) => {
    const quote = model => sequelize.getQueryInterface().queryGenerator.quoteTable(model.getTableName());
    const [rows] = await sequelize.query(`
 SELECT MAX(CASE WHEN r.data->>'blockHeight' ~ '^[0-9]+$'
  THEN (r.data->>'blockHeight')::numeric END)::text AS height
 FROM ${quote(models.crypto_transfers)} r
 JOIN ${quote(models.crypto_invoices)} i ON i.id::text = r."cryptoInvoiceId"
 WHERE i."addressId" = :addressId AND i."assetId" = :assetId
  AND r.data->>'confirmed' = 'true'
 `, { replacements: { addressId, assetId }, transaction });
    return rows[0]?.height || null;
  };
  return models;
}
