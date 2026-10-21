import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize) {
  const ContentArchive = sequelize.define('contentArchive', {
    originalStorageId: {type: DataTypes.STRING(100), allowNull: false},
    archivedStorageId: {type: DataTypes.STRING(100), allowNull: false},
    userId: {type: DataTypes.INTEGER, allowNull: false},
  }, {
    indexes: [
      {fields: ['originalStorageId'], unique: true},
      {fields: ['archivedStorageId']},
    ],
  });
  return {ContentArchive: await ContentArchive.sync({})};
}
