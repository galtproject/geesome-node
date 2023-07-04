export {};

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-content-bots', 'geesome', 'geesome', require('./config').options);

	const User = sequelize.define('user', {
		title: {
			type: Sequelize.STRING
		},
		tgId: {
			type: Sequelize.STRING
		},
		savedSize: {
			type: Sequelize.FLOAT,
			defaultValue: 0
		},
		contentLimit: {
			type: Sequelize.FLOAT,
			defaultValue: 0
		},
	}, {});

	const Description = sequelize.define('description', {
		tgId: {
			type: Sequelize.STRING,
			allowNull: true
		},
		contentId: {
			type: Sequelize.STRING,
			allowNull: true
		},
		ipfsContent: {
			type: Sequelize.STRING,
			allowNull: true
		},
		text: {
			type: Sequelize.TEXT,
			allowNull: true
		},
		aitext: {
			type: Sequelize.TEXT,
			allowNull: true
		}
	}, {});

	const ContentBots = sequelize.define('contentBot', {
		encryptedToken: {
			type: Sequelize.TEXT,
			allowNull: true
		},
		botId: {
			type: Sequelize.STRING,
			allowNull: true
		},
		botUsername: {
			type: Sequelize.STRING,
			allowNull: true
		},
		socNet: {
			type: Sequelize.STRING,
			allowNull: true
		},
		userId: {
			type: Sequelize.STRING,
			allowNull: true
		},
		tokenHash: {
			type: Sequelize.STRING,
			allowNull: true
		}
	}, {});

	return {
		User: await User.sync({}),
		Description: await Description.sync({}),
		ContentBots: await ContentBots.sync({})
	};
};
