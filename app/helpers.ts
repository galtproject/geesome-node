const _ = require('lodash');

module.exports = {
	validateEmail(email) {
		return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
	},

	validateUsername(username) {
		return /^\w+([\.-]?\w)+$/.test(username);
	},

	log(){
		const logArgs = _.map(arguments, (arg) => arg);

		const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		logArgs.splice(0, 0, dateTimeStr);

		console.log.apply(console, logArgs);
	}
}