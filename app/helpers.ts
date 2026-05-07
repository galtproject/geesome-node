import fs from 'fs';
import _ from 'lodash';
import bcrypt from 'bcrypt';
import {dirname} from 'path';
import cryptoJS from "crypto-js";
import {fileURLToPath} from 'url';
import createKeccakHash from "keccak";
import commonHelper from "geesome-libs/src/common.js";
import {IListParams} from "./modules/database/interface.js";
const {map, pick} = _;

const saltRounds = 10;
const maxListLimit = 10000;

function parseNonNegativeInteger(value, fallback = null) {
	const parsed = Number.parseInt(value as any, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}

function sanitizeSortBy(value, fallback = 'createdAt') {
	if (typeof value !== 'string') {
		return fallback;
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		return fallback;
	}
	return value;
}

function sanitizeSortDir(value, fallback = 'DESC') {
	const sortDir = typeof value === 'string' ? value.toUpperCase() : fallback.toUpperCase();
	if (sortDir !== 'ASC' && sortDir !== 'DESC') {
		return fallback.toUpperCase();
	}
	return sortDir;
}

function getCurDir() {
	const __filename = fileURLToPath(import.meta.url);
	return dirname(__filename);
}

export default {
	getCurDir,

	validateEmail(email) {
		return /^\w+([\+\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email);
	},

	validateUsername(username) {
		return /^\w+([\.-]?\w)+$/.test(username) && username.length <= 42;
	},

	keccak(text) {
		return createKeccakHash('keccak256').update(text).digest('hex');
	},

	base64ToArrayBuffer(base64) {
		let binary_string = atob(base64);
		let len = binary_string.length;
		let bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binary_string.charCodeAt(i);
		}
		return bytes;
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
		const keyDir = `${getCurDir()}/../data`;
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

	log(...args){
		const logArgs = map(arguments, (arg) => arg);

		const dateTimeStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
		logArgs.splice(0, 0, dateTimeStr);

		console.log.apply(console, logArgs);
	},

	prepareListParams(listParams?: IListParams): IListParams {
		const res = pick(listParams || {}, ['sortBy', 'sortDir', 'limit', 'offset']);
		res.sortBy = sanitizeSortBy(res.sortBy);
		res.sortDir = sanitizeSortDir(res.sortDir);

		const limit = parseNonNegativeInteger(res.limit);
		if (limit !== null) {
			res.limit = Math.min(limit, maxListLimit);
		} else {
			delete res.limit;
		}

		const offset = parseNonNegativeInteger(res.offset);
		if (offset !== null) {
			res.offset = offset;
		} else {
			delete res.offset;
		}

		return res;
	},

	// C1: strip visibility-override fields so untrusted callers cannot bypass the
	// Published-only default in getPostsWhere by passing ?status=draft etc.
	sanitizePublicPostFilters(filters: any = {}): any {
		const out = {...filters};
		delete out.status;
		delete out.statusNe;
		delete out.statusIn;
		delete out.includeAllStatuses;
		delete out.isDeleted;
		return out;
	}
}
