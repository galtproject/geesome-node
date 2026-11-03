import {DataTypes, Sequelize} from 'sequelize';

export default async function createModels(sequelize: Sequelize) {
	const PublicationJob = sequelize.define('publicationJob', {
		userId: {type: DataTypes.INTEGER, allowNull: false},
		postId: {type: DataTypes.INTEGER, allowNull: false},
		requestKey: {type: DataTypes.STRING(128), allowNull: false},
		requestHash: {type: DataTypes.STRING(64), allowNull: false},
		composeKey: {type: DataTypes.STRING(128)},
		composeHash: {type: DataTypes.STRING(64)},
		composeIndex: {type: DataTypes.INTEGER},
		network: {type: DataTypes.STRING(20), allowNull: false},
		localAccountId: {type: DataTypes.STRING(200), allowNull: false},
		target: {type: DataTypes.JSONB, allowNull: false},
		payload: {type: DataTypes.JSONB, allowNull: false},
		scheduledAt: {type: DataTypes.DATE, allowNull: false},
		status: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued'},
		claimToken: {type: DataTypes.STRING(64)},
		processingAt: {type: DataTypes.DATE},
		remoteId: {type: DataTypes.STRING(500)},
		remoteUrl: {type: DataTypes.TEXT},
		error: {type: DataTypes.STRING(500)}
	}, {
		indexes: [
			{name: 'publication_jobs_compose_unique', unique: true, fields: ['userId', 'composeKey', 'composeIndex']},
			{name: 'publication_jobs_post_idx', fields: ['postId']},
			{name: 'publication_jobs_owner_request_unique', unique: true, fields: ['userId', 'requestKey']},
			{name: 'publication_jobs_owner_due_idx', fields: ['userId', 'status', 'scheduledAt', 'id']},
			{name: 'publication_jobs_owner_created_idx', fields: ['userId', 'createdAt', 'id']}
		]
	});
	await PublicationJob.sync({alter: {drop: false}});
	return {PublicationJob};
}
