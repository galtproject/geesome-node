import {DataTypes, QueryTypes, Sequelize} from 'sequelize';

export default async function createModels(sequelize: Sequelize) {
  const models: any = {};
  for (const [name, entity] of [['SocialPostStatistic', 'jobId'], ['SocialGroupStatistic', 'destinationId']]) {
    const Model: any = sequelize.define(name, {
      userId: {type: DataTypes.INTEGER, allowNull: false},
      [entity]: {type: DataTypes.INTEGER, allowNull: false},
      periodStart: {type: DataTypes.DATEONLY, allowNull: false},
      observedAt: {type: DataTypes.DATE, allowNull: false},
      metrics: {type: DataTypes.JSONB, allowNull: false}
    }, {indexes: [{unique: true, fields: ['userId', entity, 'periodStart']}]});
    // Conditional conflict update makes delayed/replayed observations harmless.
    Model.recordObservation = async (data, transaction) => {
      const generator: any = sequelize.getQueryInterface().queryGenerator;
      const table = generator.quoteTable(Model.getTableName());
      await sequelize.query(`INSERT INTO ${table} ("userId", "${entity}", "periodStart", "observedAt", "metrics", "createdAt", "updatedAt")
        VALUES (:userId, :entityId, :periodStart, :observedAt, CAST(:metrics AS jsonb), NOW(), NOW())
        ON CONFLICT ("userId", "${entity}", "periodStart") DO UPDATE SET "observedAt"=EXCLUDED."observedAt", "metrics"=EXCLUDED."metrics", "updatedAt"=NOW()
        WHERE ${table}."observedAt" < EXCLUDED."observedAt"`, {
        replacements: {...data, entityId: data[entity], metrics: JSON.stringify(data.metrics)}, transaction
      });
    };
    if (entity === 'destinationId') {
      Model.latestGuildSnapshots = async (userId, guildId, limit = 2) => {
        const generator: any = sequelize.getQueryInterface().queryGenerator;
        const table = generator.quoteTable(Model.getTableName());
        const destination = generator.quoteTable(sequelize.models.publicationDestination.getTableName());
        return sequelize.query(`SELECT DISTINCT ON (s."periodStart") s.* FROM ${table} s
          JOIN ${destination} d ON d.id=s."destinationId" AND d."userId"=s."userId"
          WHERE s."userId"=:userId AND d.network='discord' AND d.target->>'guildId'=:guildId
          ORDER BY s."periodStart" DESC, s."observedAt" DESC, s.id DESC LIMIT :limit`,
          {replacements: {userId, guildId, limit}, type: QueryTypes.SELECT});
      };
    }
    models[name] = await Model.sync({});
  }
  const TelegramStatisticsReader = sequelize.define('telegramStatisticsReader', {
    userId: {type: DataTypes.INTEGER, allowNull: false},
    destinationId: {type: DataTypes.INTEGER, allowNull: false},
    accountId: {type: DataTypes.INTEGER, allowNull: false}
  }, {indexes: [{unique: true, fields: ['userId', 'destinationId']}]});
  models.TelegramStatisticsReader = await TelegramStatisticsReader.sync({});
  return models;
}
