import fs from 'fs';
import _ from 'lodash';
import bcrypt from 'bcrypt';
import {dirname} from 'path';
import cryptoJS from "crypto-js";
import {fileURLToPath} from 'url';
import createKeccakHash from "keccak";
import {Op} from 'sequelize';
import commonHelper from "geesome-libs/src/common.js";
import {IListParams, IListParamsOptions} from "./modules/database/interface.js";
const {map, pick} = _;

const saltRounds = 10;
const maxListLimit = 10000;
type CursorDirection = 'before' | 'after';

type ListCursorOptions = {
	valueField?: string;
	idField?: string;
	cursorValueFilter?: string;
	cursorIdFilter?: string;
	direction?: CursorDirection;
	orderDir?: string;
};

type ListCursorState = {
	hasCursor: boolean;
	valueField: string;
	idField: string;
	direction: CursorDirection;
	orderDir?: string;
	value?: any;
	id?: number;
};

type WhereParamType = 'boolean' | 'string';
type WhereParamsOptions = Record<string, WhereParamType>;

function parseNonNegativeInteger(value, fallback = null) {
	const parsed = Number.parseInt(value as any, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}

function parsePositiveInteger(value, fallback) {
	const parsed = Number.parseInt(value as any, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function parseBoolean(value, fallback = false) {
	const normalized = String(value ?? '').toLowerCase();
	if (['1', 'true', 'yes'].includes(normalized)) {
		return true;
	}
	if (['0', 'false', 'no'].includes(normalized)) {
		return false;
	}
	return fallback;
}

function sanitizeSortBy(value, fallback = 'createdAt', allowedSortBy?: string[]) {
	const fallbackSortBy = allowedSortBy?.includes(fallback) || !allowedSortBy?.length ? fallback : allowedSortBy[0];
	if (typeof value !== 'string') {
		return fallbackSortBy;
	}
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
		return fallbackSortBy;
	}
	if (allowedSortBy?.length && !allowedSortBy.includes(value)) {
		return fallbackSortBy;
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

function sanitizeBooleanFilter(value) {
	if (value === 'true') {
		return true;
	}
	if (value === 'false') {
		return false;
	}
	if (value === true || value === false) {
		return value;
	}
	return undefined;
}

function sanitizeWhereParam(value, type: WhereParamType) {
	if (type === 'boolean') {
		return sanitizeBooleanFilter(value);
	}
	if (type === 'string' && typeof value === 'string') {
		return value;
	}
	return undefined;
}

function getCursorOptions(options: ListCursorOptions = {}) {
	return {
		valueField: options.valueField || 'publishedAt',
		idField: options.idField || 'id',
		cursorValueFilter: options.cursorValueFilter || 'cursorPublishedAt',
		cursorIdFilter: options.cursorIdFilter || 'cursorId',
		direction: options.direction || 'before',
		orderDir: options.orderDir,
	};
}

function getListLimitCap(options: IListParamsOptions = {}) {
	const cap = parseNonNegativeInteger(options.maxLimit, maxListLimit);
	return Math.min(cap, maxListLimit);
}

function isCursorValuePresent(value) {
	return typeof value !== 'undefined' && value !== null;
}

function parseCursorId(value) {
	const parsed = Number.parseInt(value as any, 10);
	if (!Number.isFinite(parsed)) {
		return null;
	}
	return parsed;
}

function getListCursorState(filters: any = {}, options: ListCursorOptions = {}): ListCursorState {
	const cursorOptions = getCursorOptions(options);
	const rawValue = filters[cursorOptions.cursorValueFilter];
	const id = parseCursorId(filters[cursorOptions.cursorIdFilter]);
	const hasCursor = isCursorValuePresent(rawValue) && id !== null;
	const state: ListCursorState = {
		hasCursor,
		valueField: cursorOptions.valueField,
		idField: cursorOptions.idField,
		direction: cursorOptions.direction as CursorDirection,
		orderDir: cursorOptions.orderDir,
	};
	if (!hasCursor) {
		return state;
	}
	state.value = rawValue instanceof Date ? rawValue : new Date(rawValue);
	state.id = id;
	return state;
}

function appendAndWhereClause(where, clause) {
	if (Array.isArray(where[Op.and])) {
		where[Op.and] = [...where[Op.and], clause];
		return;
	}
	where[Op.and] = [clause];
}

function getCursorComparisonOperator(direction: CursorDirection) {
	if (direction === 'after') {
		return Op.gt;
	}
	return Op.lt;
}

function getCursorListOrder(cursor: ListCursorState, listParams: IListParams): any[] {
	const sortDir = listParams.sortDir.toUpperCase();
	if (cursor.hasCursor) {
		const cursorSortDir = cursor.orderDir ? sanitizeSortDir(cursor.orderDir, sortDir) : 'DESC';
		return [[cursor.valueField, cursorSortDir], [cursor.idField, cursorSortDir]];
	}
	return [[listParams.sortBy, sortDir], [cursor.idField, sortDir]];
}

function getCursorListOffset(cursor: ListCursorState, offset) {
	if (cursor.hasCursor) {
		return undefined;
	}
	return offset;
}

function getCursorListAttributes(baseAttributes: string[], cursor: ListCursorState, sortBy) {
	const orderField = cursor.hasCursor ? cursor.valueField : sortBy;
	if (!orderField) {
		return Array.from(new Set(baseAttributes));
	}
	return Array.from(new Set([...baseAttributes, orderField]));
}

function getNextListCursor(cursor: ListCursorState, pageRows: any[], limit) {
	if (!cursor.hasCursor || pageRows.length !== limit) {
		return null;
	}
	return getNextCursorFromRows(pageRows, limit, cursor);
}

function getNextCursorFromRows(pageRows: any[], limit, options: ListCursorOptions = {}) {
	if (pageRows.length !== limit) {
		return null;
	}
	const cursorOptions = getCursorOptions(options);
	const last = pageRows[pageRows.length - 1];
	return {
		[cursorOptions.valueField]: last[cursorOptions.valueField],
		[cursorOptions.idField]: last[cursorOptions.idField],
	};
}

function getCursorFiltersFromCursor(cursor, options: ListCursorOptions = {}) {
	if (!cursor) {
		return {};
	}
	const cursorOptions = getCursorOptions(options);
	return {
		[cursorOptions.cursorValueFilter]: cursor[cursorOptions.valueField],
		[cursorOptions.cursorIdFilter]: cursor[cursorOptions.idField],
	};
}

function addCursorWhere(where, filters: any = {}, options: ListCursorOptions = {}) {
	const cursor = getListCursorState(filters, options);
	if (!cursor.hasCursor) {
		return cursor;
	}
	const comparisonOperator = getCursorComparisonOperator(cursor.direction);
	appendAndWhereClause(where, {
		[Op.or]: [
			{[cursor.valueField]: {[comparisonOperator]: cursor.value}},
			{[cursor.valueField]: cursor.value, [cursor.idField]: {[comparisonOperator]: cursor.id}}
		]
	});
	return cursor;
}

function getCurDir() {
	const __filename = fileURLToPath(import.meta.url);
	return dirname(__filename);
}

function hasId(id) {
	return id !== null && typeof id !== 'undefined';
}

function normalizeUniqueIds(ids: any = []) {
	const values = Array.isArray(ids) ? ids : [ids];
	const uniqueIds: number[] = [];
	const seenIds = new Set<number>();
	values.forEach((id) => {
		if (!hasId(id)) {
			return;
		}
		const parsed = Number(id);
		if (!Number.isFinite(parsed) || seenIds.has(parsed)) {
			return;
		}
		seenIds.add(parsed);
		uniqueIds.push(parsed);
	});
	return uniqueIds;
}

function shouldIncludeListTotal(listParams: IListParams = {}, cursor: {hasCursor?: boolean} = {}) {
	if (cursor.hasCursor) {
		return false;
	}
	return listParams.includeTotal !== false;
}

export default {
	getCurDir,

	hasId,

	normalizeUniqueIds,

	shouldIncludeListTotal,

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

	parsePositiveInteger,

	parseBoolean,

	prepareListParams(listParams?: IListParams, options: IListParamsOptions = {}): IListParams {
		const res = pick(listParams || {}, ['sortBy', 'sortDir', 'limit', 'offset', 'includeTotal']);
		const defaultSortBy = sanitizeSortBy(options.sortBy, 'createdAt', options.allowedSortBy);
		res.sortBy = sanitizeSortBy(res.sortBy, defaultSortBy, options.allowedSortBy);
		res.sortDir = sanitizeSortDir(res.sortDir);

		const includeTotal = sanitizeBooleanFilter(res.includeTotal);
		if (includeTotal !== undefined) {
			res.includeTotal = includeTotal;
		} else {
			delete res.includeTotal;
		}

		const limit = parseNonNegativeInteger(res.limit);
		const limitCap = getListLimitCap(options);
		if (limit !== null) {
			res.limit = Math.min(limit, limitCap);
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

	prepareWhereParams(params: any = {}, options: WhereParamsOptions = {}) {
		const res = pick(params || {}, Object.keys(options));
		Object.keys(options).forEach((key) => {
			const value = sanitizeWhereParam(res[key], options[key]);
			if (value === undefined) {
				delete res[key];
				return;
			}
			res[key] = value;
		});
		return res;
	},

	getListCursorState,

	addCursorWhere,

	getCursorListOrder,

	getCursorListOffset,

	getCursorListAttributes,

	getNextListCursor,

	getNextCursorFromRows,

	getCursorFiltersFromCursor,

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
