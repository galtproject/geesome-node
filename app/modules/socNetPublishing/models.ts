import {DataTypes, Sequelize} from 'sequelize';

export default async function createModels(sequelize: Sequelize) {
	const PublicationJob: any = sequelize.define('publicationJob', {
		userId: {type: DataTypes.INTEGER, allowNull: false},
		postId: {type: DataTypes.INTEGER, allowNull: false},
		requestKey: {type: DataTypes.STRING(128), allowNull: false},
		requestHash: {type: DataTypes.STRING(64), allowNull: false},
		composeKey: {type: DataTypes.STRING(128)},
		composeHash: {type: DataTypes.STRING(64)},
		composeIndex: {type: DataTypes.INTEGER},
		producer: {type: DataTypes.JSONB},
		contentPolicy: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'nsfw'},
		contentType: {type: DataTypes.STRING(20)},
		intentVersion: {type: DataTypes.INTEGER},
			destinationId: {type: DataTypes.INTEGER},
			clientId: {type: DataTypes.STRING(200)},
			serverAccountId: {type: DataTypes.INTEGER},
			accountIdentity: {type: DataTypes.STRING(200)},
			executionMode: {type: DataTypes.STRING(20)},
		network: {type: DataTypes.STRING(20), allowNull: false},
		localAccountId: {type: DataTypes.STRING(200), allowNull: true},
		target: {type: DataTypes.JSONB, allowNull: false},
		payload: {type: DataTypes.JSONB, allowNull: false},
		scheduledAt: {type: DataTypes.DATE, allowNull: false},
		status: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'queued'},
		claimToken: {type: DataTypes.STRING(64)},
		processingAt: {type: DataTypes.DATE},
		confirmedAt: {type: DataTypes.DATE},
		remoteId: {type: DataTypes.STRING(500)},
		remoteUrl: {type: DataTypes.TEXT},
		error: {type: DataTypes.STRING(500)}
	}, {
		indexes: [
			{name: 'publication_jobs_compose_unique', unique: true, fields: ['userId', 'composeKey', 'composeIndex']},
			{name: 'publication_jobs_owner_destination_confirmed_idx', fields: ['userId', 'destinationId', 'confirmedAt'], where: {status: 'posted'}},
			{name: 'publication_jobs_post_idx', fields: ['postId']},
			{name: 'publication_jobs_owner_request_unique', unique: true, fields: ['userId', 'requestKey']},
			{name: 'publication_jobs_owner_due_idx', fields: ['userId', 'status', 'scheduledAt', 'id']},
			{name: 'publication_jobs_owner_created_idx', fields: ['userId', 'createdAt', 'id']}
		]
	});
	PublicationJob.publicationCounts = async (userId, destinationIds, now) => {
		if (!destinationIds.length) {
			return new Map();
		}
		const generator: any = sequelize.getQueryInterface().queryGenerator;
		const table = generator.quoteTable(PublicationJob.getTableName());
		const [rows]: any = await sequelize.query(`SELECT "destinationId",
			COUNT(DISTINCT "remoteId") FILTER (WHERE "confirmedAt">=:day) AS "last24Hours",
			COUNT(DISTINCT "remoteId") AS "last7Days"
			FROM ${table} WHERE "userId"=:userId AND "destinationId" IN (:destinationIds)
			AND "status"='posted' AND "remoteId" IS NOT NULL AND "remoteId"<>''
			AND "confirmedAt">=:week AND "confirmedAt"<=:now GROUP BY "destinationId"`,
			{replacements: {userId, destinationIds, now, day: new Date(now.getTime() - 86400000), week: new Date(now.getTime() - 7 * 86400000)}});
		return new Map(rows.map(row => [Number(row.destinationId), {last24Hours: Number(row.last24Hours), last7Days: Number(row.last7Days)}]));
	};
	await PublicationJob.sync({alter: {drop: false}});
	const PublicationDestination = sequelize.define('publicationDestination', {
		userId: {type: DataTypes.INTEGER, allowNull: false},
		clientId: {type: DataTypes.STRING(200), allowNull: true},
		localKey: {type: DataTypes.STRING(200), allowNull: false},
		sourceGroupId: {type: DataTypes.INTEGER},
		localAccountId: {type: DataTypes.STRING(200), allowNull: true},
		network: {type: DataTypes.STRING(20), allowNull: false},
		accountIdentity: {type: DataTypes.STRING(200)},
		label: {type: DataTypes.STRING(200), allowNull: false},
		contentPolicy: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'nsfw'},
		executionMode: {type: DataTypes.STRING(20), allowNull: false, defaultValue: 'client'},
		socNetAccountId: {type: DataTypes.INTEGER},
		target: {type: DataTypes.JSONB, allowNull: false},
		enabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true}
	}, {indexes: [
		{name: 'publication_destinations_client_key_unique', unique: true, fields: ['userId', 'clientId', 'localKey']},
		{name: 'publication_destinations_server_key_unique', unique: true, fields: ['userId', 'executionMode', 'localKey'], where: {executionMode: 'server'}},
		{name: 'publication_destinations_owner_idx', fields: ['userId', 'id']}
	]});
	await PublicationDestination.sync({});
	const PublicationDestinationGroup = sequelize.define('publicationDestinationGroup', {
		userId: {type: DataTypes.INTEGER, allowNull: false},
		requestKey: {type: DataTypes.STRING(128), allowNull: false},
		creationHash: {type: DataTypes.STRING(64), allowNull: false},
		label: {type: DataTypes.STRING(200), allowNull: false},
		destinationIds: {type: DataTypes.JSONB, allowNull: false},
		revision: {type: DataTypes.INTEGER, allowNull: false, defaultValue: 1},
		enabled: {type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true}
	}, {indexes: [
		{name: 'publication_destination_groups_owner_key_unique', unique: true, fields: ['userId', 'requestKey']},
		{name: 'publication_destination_groups_owner_idx', fields: ['userId', 'id']}
	]});
	await PublicationDestinationGroup.sync({});
	return {PublicationJob, PublicationDestination, PublicationDestinationGroup};
}
