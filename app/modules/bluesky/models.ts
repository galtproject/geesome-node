import {DataTypes, Sequelize} from 'sequelize';
import {BlueskySourcePostReviewState, BlueskySourceSubscriptionStatus} from './interface.js';
import {RemoteContentModerationMode} from '../remoteContentModeration/helpers.js';

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
		moderationMode: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: RemoteContentModerationMode.AutoImport
		},
		moderationRulesJson: {
			type: DataTypes.TEXT,
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

	const BlueskySourcePostReview = sequelize.define('blueskySourcePostReview', {
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		sourceSubscriptionId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		actor: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		uri: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		cid: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		sourceChannelId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: BlueskySourcePostReviewState.Pending
		},
		moderationAction: {
			type: DataTypes.STRING(30),
			allowNull: false
		},
		moderationDecisionJson: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		projectionJson: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		publishedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		importedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		reviewedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		reviewedByUserId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'bluesky_source_post_reviews_source_uri_unique', fields: ['sourceSubscriptionId', 'uri'], unique: true},
			{name: 'bluesky_source_post_reviews_user_state_idx', fields: ['userId', 'state', 'updatedAt']},
			{name: 'bluesky_source_post_reviews_source_state_idx', fields: ['sourceSubscriptionId', 'state', 'publishedAt', 'id']},
			{name: 'bluesky_source_post_reviews_source_channel_idx', fields: ['sourceChannelId']}
		]
	} as any);

	return {
		BlueskySourceSubscription: await BlueskySourceSubscription.sync({}),
		BlueskySourcePostReview: await BlueskySourcePostReview.sync({})
	};
};
