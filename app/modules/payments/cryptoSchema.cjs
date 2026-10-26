exports.cryptoSchema = S => {
    const id = { type: S.UUID, primaryKey: true, allowNull: false }, str = (n = 200) => ({ type: S.STRING(n), allowNull: false }), json = { type: S.JSONB, allowNull: false };
    const tables = {
        crypto_wallets: { id, checkedAt: { type: S.DATE }, checkError: { type: S.STRING(100) }, resourceId: str(30), network: str(20), enabled: { type: S.BOOLEAN, allowNull: false, defaultValue: false }, xpub: { type: S.TEXT }, pool: json, nextIndex: { type: S.INTEGER, allowNull: false, defaultValue: 0 }, assets: json, version: { type: S.INTEGER, allowNull: false, defaultValue: 1 } },
        crypto_addresses: { id, identity: { ...str(), unique: true }, walletId: str(), address: str(), network: str(20), index: { type: S.INTEGER } },
        crypto_invoices: { id, resourceId: str(30), readerId: str(), invoiceId: { ...str(), unique: true }, requestKey: { ...str(64), unique: true }, assetId: str(30), addressId: str(), snapshot: json, status: str(30), expiresAt: { type: S.DATE, allowNull: false }, nextCheckAt: { type: S.DATE, allowNull: false }, lastError: { type: S.STRING(100) }, scanLease: { type: S.UUID }, scanLeaseUntil: { type: S.DATE }, receivedAtomic: str(100) },
        crypto_transfers: { id, eventKey: { ...str(), unique: true }, cryptoInvoiceId: str(), data: json },
    };
    return Object.fromEntries(Object.entries(tables).map(([name,fields]) => [name,Object.fromEntries(Object.entries(fields).map(([field,definition]) => [field,{...definition}]))]));
};
