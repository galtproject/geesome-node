import { DataTypes } from 'sequelize';
export default async function (sequelize) {
  const str = (size = 200) => ({ type: DataTypes.STRING(size), allowNull: false });
  const models: any = {};
  const definitions = {
    publications: { stagingPaths: {type: DataTypes.JSONB, allowNull: false, defaultValue: []}, id: {type: DataTypes.UUID, primaryKey: true}, resourceId: str(30), requestKey: str(), attempts: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0}, nextAttemptAt: {type: DataTypes.DATE}, status: str(20), leaseToken: {type: DataTypes.UUID}, leaseUntil: {type: DataTypes.DATE}, error: {type: DataTypes.STRING(100)}, manifest: {type: DataTypes.JSONB, allowNull: false, defaultValue: {}}, sourceVersion: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0} },
    publication_heads: { checkedAt: {type: DataTypes.DATE, allowNull: false, defaultValue: new Date(0)}, sourceVersion: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0}, resourceId: {...str(30), primaryKey: true}, publicationId: {type: DataTypes.UUID, allowNull: true}, enabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false} },
    publication_artifacts: { storageId: {...str(), primaryKey: true}, publicationId: {type: DataTypes.UUID, allowNull: false}, resourceId: str(30) },
    site_settings: { resourceId: { ...str(30), primaryKey: true }, googleClientId: { ...str(), defaultValue: '' }, enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, registrationEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, version: { type: DataTypes.INTEGER, allowNull: false } },
    resources: { id: { ...str(30), primaryKey: true }, domain: { ...str(), unique: true }, ownerId: { type: DataTypes.INTEGER, allowNull: false }, groupId: { ...str(), unique: true }, postsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, data: { type: DataTypes.JSONB, allowNull: false } },
    options: { id: { type: DataTypes.UUID, primaryKey: true }, resourceId: str(30), label: str(), amountCents: { type: DataTypes.INTEGER, allowNull: false }, currency: str(3), period: str(10), enabled: { type: DataTypes.BOOLEAN, allowNull: false }, version: { type: DataTypes.INTEGER, allowNull: false } },
    periods: { id: { type: DataTypes.UUID, primaryKey: true }, resourceId: str(30), readerId: str(), invoiceId: { ...str(), unique: true }, anchorDay: { type: DataTypes.INTEGER, allowNull: false }, startsAt: { type: DataTypes.DATE, allowNull: false }, endsAt: { type: DataTypes.DATE, allowNull: false }, revoked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false } }
  };
  const indexes = { publication_heads: [{fields: ['checkedAt', 'resourceId']}], publication_artifacts: [{fields: ['publicationId']}], publications: [{fields: ['resourceId', 'requestKey'], unique: true}, {fields: ['status', 'leaseUntil']}, {fields: ['status', 'nextAttemptAt', 'createdAt']}, {fields: ['resourceId', 'createdAt']}], options: [{ fields: ['resourceId', 'enabled'] }], periods: [{ fields: ['resourceId', 'readerId', 'endsAt'] }] };
  for (const [name, fields] of Object.entries(definitions)) {
    models[name] = sequelize.define(`membership_${name}`, fields, { tableName: `membership_${name}`, indexes: indexes[name] || [] });
    await models[name].sync({});
  }
  return models;
}
