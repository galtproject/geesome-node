import {DataTypes, Op, QueryTypes, Sequelize} from 'sequelize';
import {ActivityPubObjectReviewState, ActivityPubSourceSubscriptionStatus} from './interface.js';

export default async function (sequelize: Sequelize) {
	const deliveryClaimSchemaState = await getActivityPubDeliveryClaimSchemaState(sequelize);
	const includeDeliveryClaimColumns = !deliveryClaimSchemaState.tableExists || deliveryClaimSchemaState.hasDeliveryClaimColumns;
	const includeDeliveryClaimIndex = !deliveryClaimSchemaState.tableExists;
	const ActivityPubActor = sequelize.define('activityPubActor', {
		entityType: {
			type: DataTypes.STRING(50),
			allowNull: false
		},
		entityId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		preferredUsername: {
			type: DataTypes.STRING(100),
			allowNull: false
		},
		actorUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		inboxUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		outboxUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		followersUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		followingUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		publicKeyPem: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		privateKeyPemEncrypted: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		isEnabled: {
			type: DataTypes.BOOLEAN,
			defaultValue: true
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_actors_entity_unique', fields: ['entityType', 'entityId'], unique: true},
			{name: 'activity_pub_actors_actor_url_unique', fields: ['actorUrl'], unique: true},
			{name: 'activity_pub_actors_username_idx', fields: ['preferredUsername']}
		]
	} as any);

	const ActivityPubRemoteActor = sequelize.define('activityPubRemoteActor', {
		actorUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		publicKeyId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		preferredUsername: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		domain: {
			type: DataTypes.STRING(255),
			allowNull: false
		},
		inboxUrl: {
			type: DataTypes.STRING(500),
			allowNull: true
		},
		sharedInboxUrl: {
			type: DataTypes.STRING(500),
			allowNull: true
		},
		publicKeyPem: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		lastFetchedAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		rawJson: {
			type: DataTypes.TEXT,
			allowNull: false
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_remote_actors_actor_url_unique', fields: ['actorUrl'], unique: true},
			{name: 'activity_pub_remote_actors_public_key_id_unique', fields: ['publicKeyId'], unique: true},
			{name: 'activity_pub_remote_actors_domain_username_idx', fields: ['domain', 'preferredUsername']}
		]
	} as any);

	const ActivityPubSourceSubscription = sequelize.define('activityPubSourceSubscription', {
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		remoteActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		sourceResource: {
			type: DataTypes.STRING(500),
			allowNull: true
		},
		sourceActorUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		bridgeProvider: {
			type: DataTypes.STRING(100),
			allowNull: true
		},
		displayName: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		status: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ActivityPubSourceSubscriptionStatus.Active
		},
		lastReadAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastRefreshRequestedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_source_subscriptions_user_remote_unique', fields: ['userId', 'remoteActorId'], unique: true},
			{name: 'activity_pub_source_subscriptions_user_status_idx', fields: ['userId', 'status', 'updatedAt']},
			{name: 'activity_pub_source_subscriptions_remote_status_idx', fields: ['remoteActorId', 'status']},
			{name: 'activity_pub_source_subscriptions_status_refresh_idx', fields: ['status', 'lastRefreshRequestedAt', 'id']}
		]
	} as any);

	const ActivityPubFollow = sequelize.define('activityPubFollow', {
		localActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		remoteActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		direction: {
			type: DataTypes.STRING(20),
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false
		},
		remoteActivityId: {
			type: DataTypes.STRING(500),
			allowNull: true
		},
		acceptedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		rejectedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		rawActivityJson: {
			type: DataTypes.TEXT,
			allowNull: false
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_follows_local_remote_direction_unique', fields: ['localActorId', 'remoteActorId', 'direction'], unique: true},
			{name: 'activity_pub_follows_remote_activity_idx', fields: ['remoteActivityId']},
			{name: 'activity_pub_follows_state_idx', fields: ['state']}
		]
	} as any);

	const ActivityPubObject = sequelize.define('activityPubObject', {
		localActorId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		localPostId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		remoteActorId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		remoteObjectUrl: {
			type: DataTypes.STRING(700),
			allowNull: true
		},
		activityId: {
			type: DataTypes.STRING(700),
			allowNull: true
		},
		objectId: {
			type: DataTypes.STRING(700),
			allowNull: false
		},
		objectType: {
			type: DataTypes.STRING(50),
			allowNull: false
		},
		origin: {
			type: DataTypes.STRING(20),
			allowNull: false
		},
		visibility: {
			type: DataTypes.STRING(30),
			allowNull: false
		},
		publishedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		rawJson: {
			type: DataTypes.TEXT,
			allowNull: false
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_objects_object_id_unique', fields: ['objectId'], unique: true},
			{name: 'activity_pub_objects_activity_id_unique', fields: ['activityId'], unique: true},
			{name: 'activity_pub_objects_local_post_unique', fields: ['localActorId', 'localPostId'], unique: true},
			{name: 'activity_pub_objects_remote_object_unique', fields: ['remoteObjectUrl'], unique: true},
			{name: 'activity_pub_objects_local_actor_origin_published_idx', fields: ['localActorId', 'origin', 'publishedAt', 'id']},
			{name: 'activity_pub_objects_remote_actor_origin_published_idx', fields: ['remoteActorId', 'origin', 'publishedAt', 'id']}
		]
	} as any);

	const ActivityPubDelivery = sequelize.define('activityPubDelivery', getActivityPubDeliveryAttributes(includeDeliveryClaimColumns), {
		indexes: getActivityPubDeliveryIndexes(includeDeliveryClaimIndex)
	} as any);
	(ActivityPubDelivery as any).claimDueForDelivery = (claimOptions) => claimDueActivityPubDeliveries(sequelize, ActivityPubDelivery, claimOptions);

	const ActivityPubObjectReview = sequelize.define('activityPubObjectReview', {
		activityPubObjectId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ActivityPubObjectReviewState.Pending
		},
		reviewedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		reviewedByUserId: {
			type: DataTypes.INTEGER,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_object_reviews_object_unique', fields: ['activityPubObjectId'], unique: true},
			{name: 'activity_pub_object_reviews_state_idx', fields: ['state']}
		]
	} as any);

	const ActivityPubFlag = sequelize.define('activityPubFlag', {
		localActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		remoteActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		activityId: {
			type: DataTypes.STRING(700),
			allowNull: false
		},
		objectId: {
			type: DataTypes.STRING(700),
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false
		},
		rawActivityJson: {
			type: DataTypes.TEXT,
			allowNull: false
		}
	} as any, {
		indexes: [
			{name: 'activity_pub_flags_activity_id_unique', fields: ['activityId'], unique: true},
			{name: 'activity_pub_flags_local_state_idx', fields: ['localActorId', 'state']},
			{name: 'activity_pub_flags_object_idx', fields: ['objectId']}
		]
	} as any);

	return {
		ActivityPubActor: await ActivityPubActor.sync({}),
		ActivityPubRemoteActor: await ActivityPubRemoteActor.sync({}),
		ActivityPubSourceSubscription: await ActivityPubSourceSubscription.sync({}),
		ActivityPubFollow: await ActivityPubFollow.sync({}),
		ActivityPubObject: await ActivityPubObject.sync({}),
		ActivityPubDelivery: await ActivityPubDelivery.sync({}),
		ActivityPubObjectReview: await ActivityPubObjectReview.sync({}),
		ActivityPubFlag: await ActivityPubFlag.sync({}),
		activityPubDeliveryClaimsSupported: includeDeliveryClaimColumns
	};
}

async function getActivityPubDeliveryClaimSchemaState(sequelize: Sequelize) {
	const [rows] = await sequelize.query(`
		SELECT
			to_regclass('"activityPubDeliveries"') IS NOT NULL AS "tableExists",
			EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'activityPubDeliveries'
					AND column_name = 'deliveryClaimedAt'
			) AS "hasDeliveryClaimedAt",
			EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'activityPubDeliveries'
					AND column_name = 'deliveryClaimExpiresAt'
			) AS "hasDeliveryClaimExpiresAt"
	`);
	const row = (rows as any[])[0] || {};
	const hasDeliveryClaimColumns = row.hasDeliveryClaimedAt === true && row.hasDeliveryClaimExpiresAt === true;

	return {
		tableExists: row.tableExists === true,
		hasDeliveryClaimColumns,
	};
}

function getActivityPubDeliveryAttributes(includeDeliveryClaimColumns: boolean) {
	const attributes = {
		localActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		remoteActorId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		followId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		activityId: {
			type: DataTypes.STRING(700),
			allowNull: false
		},
		activityType: {
			type: DataTypes.STRING(50),
			allowNull: false
		},
		inboxUrl: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		bodyJson: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false
		},
		attempts: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		},
		nextAttemptAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		deliveredAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any;

	if (includeDeliveryClaimColumns) {
		attributes.deliveryClaimedAt = {
			type: DataTypes.DATE,
			allowNull: true
		};
		attributes.deliveryClaimExpiresAt = {
			type: DataTypes.DATE,
			allowNull: true
		};
	}

	return attributes;
}

function getActivityPubDeliveryIndexes(includeDeliveryClaimIndex: boolean) {
	const indexes = [
		{name: 'activity_pub_deliveries_activity_inbox_unique', fields: ['activityId', 'inboxUrl'], unique: true},
		{name: 'activity_pub_deliveries_next_attempt_idx', fields: ['state', 'nextAttemptAt']},
		{name: 'activity_pub_deliveries_follow_idx', fields: ['followId']}
	];

	if (includeDeliveryClaimIndex) {
		indexes.push({
			name: 'activity_pub_deliveries_claim_idx',
			fields: ['state', 'nextAttemptAt', 'deliveryClaimExpiresAt', 'id']
		} as any);
	}

	return indexes;
}

async function claimDueActivityPubDeliveries(sequelize: Sequelize, ActivityPubDelivery, {now, claimExpiresAt, limit}) {
	const claimedRows = await sequelize.query<{id: number}>(`
		WITH due_deliveries AS (
			SELECT id
			FROM "activityPubDeliveries"
			WHERE state = 'pending'
				AND "nextAttemptAt" <= :now
				AND ("deliveryClaimExpiresAt" IS NULL OR "deliveryClaimExpiresAt" <= :now)
			ORDER BY "nextAttemptAt" ASC, id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT :limit
		)
		UPDATE "activityPubDeliveries" AS "activityPubDelivery"
		SET
			"deliveryClaimedAt" = :now,
			"deliveryClaimExpiresAt" = :claimExpiresAt,
			"updatedAt" = :now
		FROM due_deliveries
		WHERE "activityPubDelivery".id = due_deliveries.id
		RETURNING "activityPubDelivery".id
	`, {
		replacements: {
			now,
			claimExpiresAt,
			limit
		},
		type: QueryTypes.SELECT
	});
	const claimedIds = claimedRows.map((row) => row.id);
	if (!claimedIds.length) {
		return [];
	}
	const deliveries = await ActivityPubDelivery.findAll({
		where: {
			id: {
				[Op.in]: claimedIds
			}
		}
	});
	const deliveryById = new Map(deliveries.map((delivery) => [Number(delivery.id), delivery]));

	return claimedIds.map((id) => deliveryById.get(Number(id))).filter(Boolean);
}
