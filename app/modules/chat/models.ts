import {DataTypes, Op, QueryTypes, Sequelize} from 'sequelize';
import {ChatDeliveryState, ChatEventState, ChatReceiptState} from './interface.js';
import {ChatAttachmentUploadState} from './attachmentLifecycle.js';

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
		sourceSyncUrl: {
			type: DataTypes.TEXT,
			allowNull: true
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

	const ChatEventAttachment = sequelize.define('chatEventAttachment', {
		chatEventId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		contentId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		storageId: {
			type: DataTypes.STRING(200),
			allowNull: false
		}
	} as any, {
		indexes: [
			{
				name: 'chat_event_attachments_event_storage_unique',
				fields: ['chatEventId', 'storageId'],
				unique: true
			},
			{name: 'chat_event_attachments_storage_idx', fields: ['storageId', 'chatEventId']}
		]
	} as any);

	const ChatAttachmentUpload = sequelize.define('chatAttachmentUpload', {
		reservationId: {
			type: DataTypes.UUID,
			allowNull: false,
			defaultValue: DataTypes.UUIDV4
		},
		userId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		expectedBytes: {
			type: DataTypes.BIGINT,
			allowNull: false
		},
		contentId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		storageId: {
			type: DataTypes.STRING(200),
			allowNull: true
		},
		chatEventId: {
			type: DataTypes.INTEGER,
			allowNull: true
		},
		state: {
			type: DataTypes.STRING(30),
			allowNull: false,
			defaultValue: ChatAttachmentUploadState.Reserved
		},
		expiresAt: {
			type: DataTypes.DATE,
			allowNull: false
		},
		uploadedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		attachedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		cancelledAt: {
			type: DataTypes.DATE,
			allowNull: true
		}
	} as any, {
		indexes: [
			{
				name: 'chat_attachment_uploads_reservation_unique',
				fields: ['reservationId'],
				unique: true
			},
			{
				name: 'chat_attachment_uploads_user_state_expiry_idx',
				fields: ['userId', 'state', 'expiresAt', 'id']
			},
			{
				name: 'chat_attachment_uploads_content_state_idx',
				fields: ['contentId', 'state', 'id']
			},
			{
				name: 'chat_attachment_uploads_event_idx',
				fields: ['chatEventId', 'id']
			}
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

	const ChatSyncState = sequelize.define('chatSyncState', {
		conversationId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		recipientOwnerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		sourceOwnerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		sourcePublicKey: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		syncUrl: {
			type: DataTypes.TEXT,
			allowNull: false
		},
		verifiedSourceSequence: {
			type: DataTypes.BIGINT,
			allowNull: false,
			defaultValue: '0'
		},
		scanAfterSourceSequence: {
			type: DataTypes.BIGINT,
			allowNull: false,
			defaultValue: '0'
		},
		lastSourceHeadSequence: {
			type: DataTypes.BIGINT,
			allowNull: true
		},
		lastSyncedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{
				name: 'chat_sync_states_conversation_recipient_source_unique',
				fields: ['conversationId', 'recipientOwnerId', 'sourceOwnerId'],
				unique: true
			},
			{
				name: 'chat_sync_states_recipient_updated_idx',
				fields: ['recipientOwnerId', 'updatedAt', 'id']
			}
		]
	} as any);

	const ChatSyncJob = sequelize.define('chatSyncJob', {
		chatSyncStateId: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		recipientOwnerId: {
			type: DataTypes.STRING(500),
			allowNull: false
		},
		nextAttemptAt: {
			type: DataTypes.DATE,
			allowNull: false,
			defaultValue: DataTypes.NOW
		},
		failureCount: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		},
		claimedAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		claimExpiresAt: {
			type: DataTypes.DATE,
			allowNull: true
		},
		claimToken: {
			type: DataTypes.STRING(64),
			allowNull: true
		},
		lastError: {
			type: DataTypes.TEXT,
			allowNull: true
		}
	} as any, {
		indexes: [
			{
				name: 'chat_sync_jobs_state_unique',
				fields: ['chatSyncStateId'],
				unique: true
			},
			{
				name: 'chat_sync_jobs_due_idx',
				fields: ['nextAttemptAt', 'claimExpiresAt', 'id']
			},
			{
				name: 'chat_sync_jobs_recipient_due_idx',
				fields: ['recipientOwnerId', 'nextAttemptAt', 'id']
			}
		]
	} as any);

	ChatEvent.hasMany(ChatEventRecipient, {as: 'recipients', foreignKey: 'chatEventId'});
	ChatEventRecipient.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatEventAttachment, {as: 'attachments', foreignKey: 'chatEventId'});
	ChatEventAttachment.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatAttachmentUpload, {as: 'attachmentUploads', foreignKey: 'chatEventId'});
	ChatAttachmentUpload.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatEventReceipt, {as: 'receipts', foreignKey: 'chatEventId'});
	ChatEventReceipt.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatEvent.hasMany(ChatDelivery, {as: 'deliveries', foreignKey: 'chatEventId'});
	ChatDelivery.belongsTo(ChatEvent, {as: 'event', foreignKey: 'chatEventId'});
	ChatSyncState.hasOne(ChatSyncJob, {as: 'syncJob', foreignKey: 'chatSyncStateId'});
	ChatSyncJob.belongsTo(ChatSyncState, {as: 'syncState', foreignKey: 'chatSyncStateId'});

	await ChatDevice.sync({});
	await ChatConversationHead.sync({});
	await ChatEvent.sync({});
	await ChatEventRecipient.sync({});
	await ChatEventAttachment.sync({});
	await ChatAttachmentUpload.sync({});
	await ChatDelivery.sync({});
	await ChatEventReceipt.sync({});
	await ChatSyncState.sync({});
	await ChatSyncJob.sync({});

	(ChatDelivery as any).claimDue = (options) => claimDueChatDeliveries(
		sequelize,
		ChatDelivery,
		options
	);
	(ChatSyncJob as any).claimDue = (options) => claimDueChatSyncJobs(
		sequelize,
		ChatSyncJob,
		options
	);
	(ChatSyncJob as any).backfillMissing = (options) => backfillMissingChatSyncJobs(
		sequelize,
		options
	);

	return {
		ChatDevice,
		ChatConversationHead,
		ChatEvent,
		ChatEventRecipient,
		ChatEventAttachment,
		ChatAttachmentUpload,
		ChatDelivery,
		ChatEventReceipt,
		ChatSyncState,
		ChatSyncJob
	};
}

async function claimDueChatSyncJobs(
	sequelize: Sequelize,
	ChatSyncJob,
	{now, claimExpiresAt, claimToken, limit, perRecipientLimit}
) {
	const claimedRows = await sequelize.query<{id: number}>(`
		WITH ranked_jobs AS (
			SELECT
				id,
				ROW_NUMBER() OVER (
					PARTITION BY "recipientOwnerId"
					ORDER BY "nextAttemptAt" ASC, id ASC
				) AS recipient_rank
			FROM "chatSyncJobs"
			WHERE "nextAttemptAt" <= :now
				AND ("claimExpiresAt" IS NULL OR "claimExpiresAt" <= :now)
		),
		due_jobs AS (
			SELECT sync_job.id
			FROM "chatSyncJobs" AS sync_job
			JOIN ranked_jobs ON ranked_jobs.id = sync_job.id
			WHERE ranked_jobs.recipient_rank <= :perRecipientLimit
			ORDER BY sync_job."nextAttemptAt" ASC, sync_job.id ASC
			FOR UPDATE OF sync_job SKIP LOCKED
			LIMIT :limit
		)
		UPDATE "chatSyncJobs" AS sync_job
		SET
			"claimedAt" = :now,
			"claimExpiresAt" = :claimExpiresAt,
			"claimToken" = :claimToken,
			"updatedAt" = :now
		FROM due_jobs
		WHERE sync_job.id = due_jobs.id
		RETURNING sync_job.id
	`, {
		replacements: {
			now,
			claimExpiresAt,
			claimToken,
			limit,
			perRecipientLimit
		},
		type: QueryTypes.SELECT
	});
	const claimedIds = claimedRows.map(row => row.id);
	if (!claimedIds.length) {
		return [];
	}
	const jobs = await ChatSyncJob.findAll({
		where: {id: {[Op.in]: claimedIds}},
		include: [{association: 'syncState', required: true}]
	});
	const jobById = new Map(
		jobs.map(job => [Number(job.id), job])
	);
	return claimedIds
		.map(id => jobById.get(Number(id)))
		.filter(Boolean);
}

async function backfillMissingChatSyncJobs(
	sequelize: Sequelize,
	{now, limit, perRecipientLimit}
) {
	await sequelize.query(`
		WITH missing_states AS (
			SELECT
				sync_state.id,
				sync_state."recipientOwnerId",
				ROW_NUMBER() OVER (
					PARTITION BY sync_state."recipientOwnerId"
					ORDER BY sync_state.id ASC
				) AS recipient_rank
			FROM "chatSyncStates" AS sync_state
			WHERE NOT EXISTS (
				SELECT 1
				FROM "chatSyncJobs" AS sync_job
				WHERE sync_job."chatSyncStateId" = sync_state.id
			)
		),
		bounded_states AS (
			SELECT id, "recipientOwnerId"
			FROM missing_states
			WHERE recipient_rank <= :perRecipientLimit
			ORDER BY id ASC
			LIMIT :limit
		)
		INSERT INTO "chatSyncJobs" (
			"chatSyncStateId",
			"recipientOwnerId",
			"nextAttemptAt",
			"failureCount",
			"createdAt",
			"updatedAt"
		)
		SELECT
			bounded_state.id,
			bounded_state."recipientOwnerId",
			:now,
			0,
			:now,
			:now
		FROM bounded_states AS bounded_state
		ON CONFLICT ("chatSyncStateId") DO NOTHING
	`, {
		replacements: {now, limit, perRecipientLimit}
	});
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
