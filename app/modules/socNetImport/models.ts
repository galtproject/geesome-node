/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
export {};

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-soc-net-import', 'geesome', 'geesome', require('./config').options);

	const Channel = sequelize.define('socNetImport_channel', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		accountId: {
			type: Sequelize.INTEGER
		},
		groupId: {
			type: Sequelize.INTEGER
		},
		channelId: {
			type: Sequelize.STRING(50)
		},
		title: {
			type: Sequelize.STRING(200)
		},
		lastMessageId: {
			type: Sequelize.INTEGER
		},
		autoImportPeriod: {
			type: Sequelize.INTEGER,
			defaultValue: 0
		},
		autoImportToken: {
			type: Sequelize.STRING(200)
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
			type: Sequelize.INTEGER
		},
		groupedId: {
			type: Sequelize.INTEGER
		},
		msgId: {
			type: Sequelize.INTEGER
		},
		postId: {
			type: Sequelize.INTEGER
		},
		replyToMsgId: {
			type: Sequelize.INTEGER
		},
		timestamp: {
			type: Sequelize.INTEGER
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'dbChannelId', 'msgId'], unique: true },
		]
	} as any);

	const ContentMessage = sequelize.define('socNetImport_contentMessage', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		groupedId: {
			type: Sequelize.INTEGER
		},
		msgId: {
			type: Sequelize.INTEGER
		},
		dbContentId: {
			type: Sequelize.INTEGER
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'dbChannelId', 'msgId', 'dbContentId'], unique: true },
			{ fields: ['dbContentId'] },
		]
	} as any);

	Message.belongsTo(Channel, {as: 'channel', foreignKey: 'dbChannelId'});
	Channel.hasMany(Message, {as: 'messages', foreignKey: 'dbChannelId'});

	ContentMessage.belongsTo(Channel, {as: 'channel', foreignKey: 'dbChannelId'});
	Channel.hasMany(ContentMessage, {as: 'contentMessages', foreignKey: 'dbChannelId'});

	return {
		Channel: await Channel.sync({}),
		Message: await Message.sync({}),
		ContentMessage: await ContentMessage.sync({}),
	};
};
