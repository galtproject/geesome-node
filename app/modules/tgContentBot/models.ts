export {};

const Sequelize: any = require('sequelize');

module.exports = async function () {
	let sequelize = new Sequelize('geesome-soc-net-import', 'geesome', 'geesome', require('./config').options);

	const User = sequelize.define('user', {
		title: {
			type: Sequelize.STRING
		},
		tgId: {
			type: Sequelize.STRING
		},
		photoSize: {
			type: Sequelize.FLOAT,
			defaultValue: 0
		},
		contentLimit: {
			type: Sequelize.FLOAT,
			defaultValue: 100
		},
	}, {});

	const Description = sequelize.define('description', {
		tgId: {
			type: Sequelize.STRING(100)
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

	return {
		User: await User.sync({}),
		Description: await Description.sync({}),
	};
};
