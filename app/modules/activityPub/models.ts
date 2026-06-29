import {DataTypes, Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize) {
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

	return {
		ActivityPubActor: await ActivityPubActor.sync({}),
		ActivityPubRemoteActor: await ActivityPubRemoteActor.sync({})
	};
}
