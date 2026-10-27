import {DataTypes} from 'sequelize';

export default async function definePublicationModels(sequelize) {
  const publications = sequelize.define('membership_publications', {
    id: {type: DataTypes.UUID, primaryKey: true},
    resourceId: {type: DataTypes.STRING(30), allowNull: false},
    requestKey: {type: DataTypes.STRING(200), allowNull: false},
    status: {type: DataTypes.STRING(20), allowNull: false},
    attempts: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0},
    nextAttemptAt: DataTypes.DATE,
    leaseToken: DataTypes.UUID,
    leaseUntil: DataTypes.DATE,
    error: DataTypes.STRING(100),
    stagingPaths: {type: DataTypes.JSONB, allowNull: false, defaultValue: []},
    manifest: {type: DataTypes.JSONB, allowNull: false, defaultValue: {}},
    sourceVersion: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 0}
  }, {tableName: 'membership_publications', indexes: [
    {fields: ['resourceId', 'requestKey'], unique: true},
    {fields: ['status', 'leaseUntil']},
    {fields: ['status', 'nextAttemptAt', 'createdAt']},
    {fields: ['resourceId', 'createdAt']}
  ]});
  // CID holds are permanent and shared across revisions/resources. Attribution
  // to the first publication is misleading when identical bytes are deduplicated.
  const publication_artifacts = sequelize.define('membership_publication_artifacts', {
    storageId: {type: DataTypes.STRING(200), primaryKey: true}
  }, {tableName: 'membership_publication_artifacts'});
  await publications.sync({});
  await publication_artifacts.sync({});
  return {publications, publication_artifacts};
}
