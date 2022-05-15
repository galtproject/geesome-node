export {};

const _ = require('lodash');
const bcrypt = require('bcrypt');
const fs = require('fs');
const saltRounds = 10;
const commonHelper = require('geesome-libs/src/common');
const cryptoJS = require("crypto-js");

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

	async getSecretKey(keyName, mode) {
		const keyDir = `${__dirname}/../data`;
		if (!fs.existsSync(keyDir)) {
			fs.mkdirSync(keyDir);
		}
		const keyPath = `${keyDir}/${keyName}.key`;
		let secretKey;
		try {
			secretKey = fs.readFileSync(keyPath).toString();
			if (secretKey) {
				return secretKey;
			}
		} catch (e) {}
		secretKey = commonHelper.random(mode);
		fs.writeFileSync(keyPath, secretKey, {encoding: 'utf8'});
		return secretKey;
	},

	encryptText(text, pass) {
		return cryptoJS.AES.encrypt(text, pass).toString();
	},

	decryptText(text, pass) {
		return cryptoJS.AES.decrypt(text, pass).toString(cryptoJS.enc.Utf8);
	},

	log(){
		const logArgs = _.map(arguments, (arg) => arg);

		const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		logArgs.splice(0, 0, dateTimeStr);

		console.log.apply(console, logArgs);
	},
}