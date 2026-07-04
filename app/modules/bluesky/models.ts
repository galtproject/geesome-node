import {DataTypes, Sequelize} from 'sequelize';
import {BlueskySourceSubscriptionStatus} from './interface.js';

export default async function (sequelize: Sequelize) {
	const BlueskySourceSubscription = sequelize.define('blueskySourceSubscription', {
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		actor: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		filter: {
			type: DataTypes.STRING(50),
			allowNull: true
		},
		displayName: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		status: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: BlueskySourceSubscriptionStatus.Active
		},
		groupName: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		accountId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		importLimit: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		dbChannelId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		lastCursor: {
			type: DataTypes.STRING(500),
			allowNull: true
		},
		lastRefreshRequestedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastImportedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'bluesky_source_subscriptions_user_actor_unique', fields: ['userId', 'actor'], unique: true},
			{name: 'bluesky_source_subscriptions_user_status_idx', fields: ['userId', 'status', 'updatedAt']},
			{name: 'bluesky_source_subscriptions_status_refresh_idx', fields: ['status', 'lastRefreshRequestedAt', 'id']},
			{name: 'bluesky_source_subscriptions_db_channel_idx', fields: ['dbChannelId']}
		]
	} as any);

	return {
		BlueskySourceSubscription: await BlueskySourceSubscription.sync({})
	};
};
