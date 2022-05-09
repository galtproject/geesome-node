const _ = require('lodash');
const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = {
	validateEmail(email) {
		return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
	},

	validateUsername(username) {
		return /^\w+([\.-]?\w)+$/.test(username) && username.length <= 42;
	},

	async hashPassword(password) {
		return new Promise((resolve, reject) => {
			if (!password) {
				return resolve(null);
			}
			bcrypt.hash(password, saltRounds, async (err, passwordHash) => err ? reject(err) : resolve(passwordHash));
		})
	},

	async comparePasswordWithHash(password, passwordHash) {
		if (!password || !passwordHash) {
			return false;
		}
		return new Promise((resolve, reject) => {
			bcrypt.compare(password, passwordHash, (err, result) => err ? reject(err) : resolve(!!result));
		});
	},


	log(){
		const logArgs = _.map(arguments, (arg) => arg);

		const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		logArgs.splice(0, 0, dateTimeStr);

		console.log.apply(console, logArgs);
	},
}