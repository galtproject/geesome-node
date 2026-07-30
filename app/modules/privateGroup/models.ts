import {DataTypes, Sequelize} from 'sequelize';

export default async function initializePrivateGroupModels(sequelize: Sequelize) {
	const PrivateGroupMembershipSnapshot = sequelize.define(
		'privateGroupMembershipSnapshot',
		{
			groupId: {
				type: DataTypes.INTEGER,
				allowNull: false
			},
			version: {
				type: DataTypes.BIGINT,
				allowNull: false
			},
			createdByUserId: {
				type: DataTypes.INTEGER,
				allowNull: false
			},
			membershipHash: {
				type: DataTypes.STRING(64),
				allowNull: false
			},
			memberCount: {
				type: DataTypes.INTEGER,
				allowNull: false
			},
			deviceCount: {
				type: DataTypes.INTEGER,
				allowNull: false
			}
		} as any,
		{
			indexes: [
				{
					name: 'private_group_membership_group_version_unique',
					fields: ['groupId', 'version'],
					unique: true
				},
				{
					name: 'private_group_membership_group_created_idx',
					fields: ['groupId', 'createdAt', 'id']
				}
			]
		} as any
	);

	const PrivateGroupMembershipDevice = sequelize.define(
		'privateGroupMembershipDevice',
		{
			privateGroupMembershipSnapshotId: {
				type: DataTypes.INTEGER,
				allowNull: false
			},
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
			}
		} as any,
		{
			indexes: [
				{
					name: 'private_group_membership_devices_snapshot_key_unique',
					fields: ['privateGroupMembershipSnapshotId', 'keyId'],
					unique: true
				},
				{
					name: 'private_group_membership_devices_user_snapshot_idx',
					fields: ['userId', 'privateGroupMembershipSnapshotId', 'id']
				}
			]
		} as any
	);

	PrivateGroupMembershipSnapshot.hasMany(PrivateGroupMembershipDevice, {
		as: 'devices',
		foreignKey: 'privateGroupMembershipSnapshotId',
		onDelete: 'CASCADE'
	});
	PrivateGroupMembershipDevice.belongsTo(PrivateGroupMembershipSnapshot, {
		as: 'snapshot',
		foreignKey: 'privateGroupMembershipSnapshotId'
	});

	await PrivateGroupMembershipSnapshot.sync({});
	await PrivateGroupMembershipDevice.sync({});

	return {
		PrivateGroupMembershipSnapshot,
		PrivateGroupMembershipDevice
	};
}
