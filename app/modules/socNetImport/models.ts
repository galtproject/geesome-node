/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize) {

	const Channel = sequelize.define('socNetImport_channel', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		accountId: {
			type: DataTypes.INTEGER
		},
		socNet: {
			type: DataTypes.STRING(50)
		},
		groupId: {
			type: DataTypes.INTEGER
		},
		channelId: {
			type: DataTypes.STRING(50)
		},
		title: {
			type: DataTypes.STRING(200)
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'channelId'], unique: true },
		]
	} as any);

	const Message = sequelize.define('socNetImport_message', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		groupedId: {
			type: DataTypes.STRING(50)
		},
		msgId: {
			type: DataTypes.STRING(50)
		},
		replyToMsgId: {
			type: DataTypes.STRING(50)
		},
		repostOfMsgId: {
			type: DataTypes.STRING(50)
		},
		postId: {
			type: DataTypes.INTEGER
		},
		timestamp: {
			type: DataTypes.INTEGER
		},
		isNeedToReverse: {
			type: DataTypes.BOOLEAN
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'dbChannelId', 'msgId'], unique: true },
			{ fields: ['dbChannelId', 'isNeedToReverse'] },
		]
	} as any);

	const ContentMessage = sequelize.define('socNetImport_contentMessage', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: DataTypes.INTEGER
		},
		groupedId: {
			type: DataTypes.STRING(50)
		},
		msgId: {
			type: DataTypes.STRING(50)
		},
		dbContentId: {
			type: DataTypes.INTEGER
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'dbChannelId', 'msgId', 'dbContentId'], name: 'sci_content_messages_user_id_db_channel_id_msg_id_db_content_id', unique: true },
			{ fields: ['dbContentId'] },
		]
	} as any);

	Message.belongsTo(Channel, {as: 'channel', foreignKey: 'dbChannelId'});
	Channel.hasMany(Message, {as: 'messages', foreignKey: 'dbChannelId'});

	Message.belongsTo(Channel, {as: 'repostOfChannel', foreignKey: 'repostOfDbChannelId'});
	Channel.hasMany(Message, {as: 'repostedMessages', foreignKey: 'repostOfDbChannelId'});

	ContentMessage.belongsTo(Channel, {as: 'channel', foreignKey: 'dbChannelId'});
	Channel.hasMany(ContentMessage, {as: 'contentMessages', foreignKey: 'dbChannelId'});

	return {
		Channel: await Channel.sync({}),
		Message: await Message.sync({}),
		ContentMessage: await ContentMessage.sync({}),
	};
};
