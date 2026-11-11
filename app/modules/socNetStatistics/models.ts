import {DataTypes, Sequelize} from 'sequelize';

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
    models[name] = await Model.sync({});
  }
  return models;
}
