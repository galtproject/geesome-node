import {DataTypes} from 'sequelize';

export default async function createModel(sequelize) {
	const Release = sequelize.define('clientRelease', {
		version: {type: DataTypes.STRING(100), allowNull: false, primaryKey: true},
		cid: {type: DataTypes.STRING(128), allowNull: false},
		envelope: {type: DataTypes.JSONB, allowNull: false},
		stable: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false}
	}, {indexes: [{name: 'client_release_single_stable', unique: true, fields: ['stable'], where: {stable: true}}]});
	await Release.sync({});
	return Release;
}
