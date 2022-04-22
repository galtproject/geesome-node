/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-soc-net', 'geesome', 'geesome', {
		'dialect': 'sqlite',
		'storage': 'data/soc-net-database.sqlite'
	});

	const Account = sequelize.define('socNetClient_telegram_account', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
			type: Sequelize.INTEGER
		},
		userAddress: {
			type: Sequelize.STRING(200)
		},
		phoneNumber: {
			type: Sequelize.STRING(200)
		},
		username: {
			type: Sequelize.STRING(200)
		},
		fullName: {
			type: Sequelize.STRING(200)
		},
		apiId: {
			type: Sequelize.STRING(200)
		},
		apiHash: {
			type: Sequelize.STRING(200)
		},
		sessionKey: {
			type: Sequelize.TEXT
		},
		isEncrypted: {
			type: Sequelize.BOOLEAN
		},
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'phoneNumber'], unique: true },
		]
	} as any);

	const Channel = sequelize.define('socNetClient_telegram_channel', {
		// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
		userId: {
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
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'channelId'], unique: true },
		]
	} as any);

	const Message = sequelize.define('socNetClient_telegram_message', {
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
	} as any, {
		indexes: [
			// http://docs.sequelizejs.com/manual/tutorial/models-definition.html#indexes
			{ fields: ['userId', 'dbChannelId', 'msgId'], unique: true },
		]
	} as any);

	Channel.belongsTo(Account, {as: 'account', foreignKey: 'accountId'});
	Account.hasMany(Channel, {as: 'channels', foreignKey: 'accountId'});

	Message.belongsTo(Channel, {as: 'channel', foreignKey: 'dbChannelId'});
	Channel.hasMany(Message, {as: 'messages', foreignKey: 'dbChannelId'});

	return {
		Account: await Account.sync({}),
		Channel: await Channel.sync({}),
		Message: await Message.sync({}),
	};
};
