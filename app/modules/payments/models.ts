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
    invoices: { id, resourceId: str(30), readerId: str(), requestKey: { ...str(), unique: true }, optionSnapshot: { type: DataTypes.JSONB, allowNull: false }, status: str(30), providerId: { type: DataTypes.STRING, unique: true }, checkoutUrl: { type: DataTypes.TEXT }, paidAt: { type: DataTypes.DATE } },
    refunds: { id, resourceId: str(30), readerId: str(), invoiceId: { ...str(), unique: true }, requestKey: { ...str(), unique: true }, reason: { type: DataTypes.TEXT }, decisionReason: { type: DataTypes.TEXT }, decidedBy: { type: DataTypes.STRING }, status: str(30) },
    ...cryptoSchema(DataTypes), ...cryptoAutomationSchema(DataTypes)
  };
  const indexes = {
    owner_payouts: [{ fields: ['payout'] }],
    invoices: [{ fields: ['resourceId', 'readerId', 'createdAt'] }],
    refunds: [{ fields: ['resourceId', 'createdAt'] }],
    crypto_wallets: [{ fields: ['resourceId', 'network'], unique: true }],
    crypto_invoices: [{ fields: ['status', 'nextCheckAt'] }],
    crypto_hd_accounts: [{ fields: ['walletFingerprint', 'readerId'], unique: true }, { fields: ['walletFingerprint', 'index'], unique: true }],
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
