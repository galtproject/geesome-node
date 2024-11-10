import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize) {

	const Description = sequelize.define('description', {
		tgId: {
			type: DataTypes.STRING,
			allowNull: true
		},
		contentId: {
			type: DataTypes.STRING,
			allowNull: true
		},
		ipfsContent: {
			type: DataTypes.STRING,
			allowNull: true
		},
		text: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		aitext: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		botId: {
			type: DataTypes.STRING,
			allowNull: true
		}
	}, {});

	const ContentBots = sequelize.define('contentBot', {
		encryptedToken: {
			type: DataTypes.TEXT,
			allowNull: true
		},
		botId: {
			type: DataTypes.STRING,
			allowNull: true
		},
		botUsername: {
			type: DataTypes.STRING,
			allowNull: true
		},
		socNet: {
			type: DataTypes.STRING,
			allowNull: true
		},
		userId: {
			type: DataTypes.STRING,
			allowNull: true
		},
		tokenHash: {
			type: DataTypes.STRING,
			allowNull: true
		}
	}, {});

	await ContentBots.sync({})

	const User = sequelize.define('user', {
		title: {
			type: DataTypes.STRING
		},
		userTgId: {
			type: DataTypes.STRING
		},
		savedSize: {
			type: DataTypes.FLOAT,
			defaultValue: 0
		},
		contentLimit: {
			type: DataTypes.FLOAT,
		},
		isAdmin: {
			type: DataTypes.BOOLEAN,
		},
	}, {});

	User.belongsTo(ContentBots, {as: 'сontentBot', foreignKey: 'contentBotId'});
	ContentBots.hasMany(User, {as: 'users', foreignKey: 'contentBotId'});

	return {
		User: await User.sync({}),
		Description: await Description.sync({}),
		ContentBots
	};
};
