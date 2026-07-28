import {DataTypes, Op, QueryTypes, Sequelize} from 'sequelize';
import {ChatDeliveryState, ChatEventState, ChatReceiptState} from './interface.js';

export default async function initializeChatModels(sequelize: Sequelize) {
	const ChatDevice = sequelize.define('chatDevice', {
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		ownerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		deviceId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		keyId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		bundleJson: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		revokedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastSeenAt: {
			type: DataTypes.DATE,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'chat_devices_user_device_unique', fields: ['userId', 'deviceId'], unique: true},
			{name: 'chat_devices_key_unique', fields: ['keyId'], unique: true},
			{name: 'chat_devices_owner_revoked_idx', fields: ['ownerId', 'revokedAt', 'createdAt', 'id']}
		]
	} as any);

	const ChatConversationHead = sequelize.define('chatConversationHead', {
		conversationId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		lastSequence: {
			type: DataTypes.BIGINT,
			allowNull: false,
			defaultValue: '0'
		}
	} as any, {
		indexes: [
			{name: 'chat_conversation_heads_conversation_unique', fields: ['conversationId'], unique: true}
		]
	} as any);

	const ChatEvent = sequelize.define('chatEvent', {
		messageId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		conversationId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		sequence: {
			type: DataTypes.BIGINT,
			allowNull: false
		},
		senderUserId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		senderOwnerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		senderDeviceId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		senderKeyId: {
			type: DataTypes.STRING(200),
			allowNull: false
		},
		senderBundleJson: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		sourceSequence: {
			type: DataTypes.BIGINT,
			allowNull: false
		},
		eventHash: {
			type: DataTypes.STRING(64),
			allowNull: false
		},
		envelopeJson: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ChatEventState.AcceptedLocal
		}
	} as any, {
		indexes: [
			{name: 'chat_events_message_unique', fields: ['messageId'], unique: true},
			{name: 'chat_events_conversation_sequence_unique', fields: ['conversationId', 'sequence'], unique: true},
			{name: 'chat_events_sender_conversation_idx', fields: ['senderUserId', 'conversationId', 'sequence', 'id']}
		]
	} as any);

	const ChatEventRecipient = sequelize.define('chatEventRecipient', {
		chatEventId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		userId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		ownerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		keyId: {
			type: DataTypes.STRING(200),
			allowNull: false
		}
	} as any, {
		indexes: [
			{name: 'chat_event_recipients_event_key_unique', fields: ['chatEventId', 'keyId'], unique: true},
			{name: 'chat_event_recipients_user_event_idx', fields: ['userId', 'chatEventId']},
			{name: 'chat_event_recipients_owner_event_idx', fields: ['ownerId', 'chatEventId']},
			{name: 'chat_event_recipients_key_event_idx', fields: ['keyId', 'chatEventId']}
		]
	} as any);

	const ChatDelivery = sequelize.define('chatDelivery', {
		chatEventId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		recipientOwnerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		recipientPublicKey: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		inboxUrl: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ChatDeliveryState.Pending
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
		deliveryClaimedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		deliveryClaimExpiresAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		deliveredAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		acknowledgedSequence: {
			type: DataTypes.BIGINT,
			allowNull: true
		},
		acknowledgedHeadSequence: {
			type: DataTypes.BIGINT,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'chat_deliveries_event_owner_unique', fields: ['chatEventId', 'recipientOwnerId'], unique: true},
			{name: 'chat_deliveries_due_idx', fields: ['state', 'nextAttemptAt']},
			{name: 'chat_deliveries_claim_idx', fields: ['state', 'nextAttemptAt', 'deliveryClaimExpiresAt', 'id']}
		]
	} as any);

	const ChatEventReceipt = sequelize.define('chatEventReceipt', {
		chatEventId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ChatReceiptState.Received
		},
		receivedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		readAt: {
			type: DataTypes.DATE,
			allowNull: true
		}
	} as any, {
		indexes: [
			{name: 'chat_event_receipts_event_user_unique', fields: ['chatEventId', 'userId'], unique: true},
			{name: 'chat_event_receipts_user_state_updated_idx', fields: ['userId', 'state', 'updatedAt', 'id']}
		]
	} as any);

	ChatEvent.hasMany(ChatEventRecipient, {as: 'recipients', foreignKey: 'chatEventId'});
	ChatEventRecipient.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatEventReceipt, {as: 'receipts', foreignKey: 'chatEventId'});
	ChatEventReceipt.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatDelivery, {as: 'deliveries', foreignKey: 'chatEventId'});
	ChatDelivery.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});

	await ChatDevice.sync({});
	await ChatConversationHead.sync({});
	await ChatEvent.sync({});
	await ChatEventRecipient.sync({});
	await ChatDelivery.sync({});
	await ChatEventReceipt.sync({});

	(ChatDelivery as any).claimDue = (options) => claimDueChatDeliveries(
		sequelize,
		ChatDelivery,
		options
	);

	return {
		ChatDevice,
		ChatConversationHead,
		ChatEvent,
		ChatEventRecipient,
		ChatDelivery,
		ChatEventReceipt
	};
}

async function claimDueChatDeliveries(
	sequelize: Sequelize,
	ChatDelivery,
	{now, claimExpiresAt, limit}
) {
	const claimedRows = await sequelize.query<{id: number}>(`
		WITH due_deliveries AS (
			SELECT id
			FROM "chatDeliveries"
			WHERE state = 'pending'
				AND "nextAttemptAt" <= :now
				AND ("deliveryClaimExpiresAt" IS NULL OR "deliveryClaimExpiresAt" <= :now)
			ORDER BY "nextAttemptAt" ASC, id ASC
			FOR UPDATE SKIP LOCKED
			LIMIT :limit
		)
		UPDATE "chatDeliveries" AS delivery
		SET
			"deliveryClaimedAt" = :now,
			"deliveryClaimExpiresAt" = :claimExpiresAt,
			"updatedAt" = :now
		FROM due_deliveries
		WHERE delivery.id = due_deliveries.id
		RETURNING delivery.id
	`, {
		replacements: {now, claimExpiresAt, limit},
		type: QueryTypes.SELECT
	});
	const claimedIds = claimedRows.map(row => row.id);
	if (!claimedIds.length) {
		return [];
	}
	const deliveries = await ChatDelivery.findAll({
		where: {id: {[Op.in]: claimedIds}},
		include: [{association: 'event', required: true}]
	});
	const deliveryById = new Map(
		deliveries.map(delivery => [Number(delivery.id), delivery])
	);
	return claimedIds
		.map(id => deliveryById.get(Number(id)))
		.filter(Boolean);
}
