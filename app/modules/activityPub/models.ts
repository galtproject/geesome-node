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

	return {
		ActivityPubActor: await ActivityPubActor.sync({})
	};
}
