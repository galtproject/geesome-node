import {randomUUID} from 'node:crypto';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export class ApiProblemError extends Error {
	status: number;
	code: string;
	title: string;
	extensions: Record<string, any>;

	constructor(status: number, code: string, title: string, detail?: string, extensions: Record<string, any> = {}) {
		super(detail || title);
		this.name = 'ApiProblemError';
		this.status = status;
		this.code = code;
		this.title = title;
		this.extensions = extensions;
	}
}

export function getRequestId(value?: string): string {
	const candidate = String(value || '').trim();
	if (candidate && candidate.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(candidate)) {
		return candidate;
	}
	return `req_${randomUUID()}`;
}

export function getApiProblem(error: any, requestId?: string) {
	const normalized = normalizeApiError(error);
	return {
		type: `https://github.com/galtproject/geesome-node/blob/dev/docs/api-problems.md#${normalized.code}`,
		title: normalized.title,
		status: normalized.status,
		code: normalized.code,
		detail: normalized.detail,
		requestId: requestId || null,
		...normalized.extensions
	};
}

export function sendApiProblem(res: any, error: any, requestId?: string) {
	const problem = getApiProblem(error, requestId || res.requestId || res.locals?.requestId);
	setResponseHeader(res, 'Content-Type', PROBLEM_CONTENT_TYPE);
	setResponseHeader(res, 'X-Request-Id', problem.requestId);
	return sendResponse(res, problem, problem.status);
}

export function sendResponse(res: any, data: any, status?: number) {
	if (typeof res.sendWithStatus === 'function') {
		return res.sendWithStatus(data, status);
	}
	if (status && typeof res.status === 'function') {
		return res.status(status).send(data);
	}
	if (typeof res.send === 'function') {
		if (status !== undefined) {
			return res.send(data, status);
		}
		return res.send(data);
	}
}

function normalizeApiError(error: any) {
	if (error instanceof ApiProblemError) {
		return {
			status: error.status,
			code: error.code,
			title: error.title,
			detail: error.message,
			extensions: error.extensions
		};
	}

	const message = getErrorMessage(error);
	const explicitStatus = getExplicitStatus(error);
	if (explicitStatus) {
		return getMappedError(explicitStatus, getStableCode(error, message), message);
	}
	if (message === 'not_permitted') {
		return getMappedError(403, 'forbidden', 'The authenticated principal is not allowed to perform this action.');
	}
	if (message === 'not_authorized') {
		return getMappedError(401, 'invalid_credentials', 'The supplied credentials are invalid or inactive.');
	}
	if (message.includes('limit_reached') || message.includes('files_limit') || message.includes('parts_limit')) {
		return getMappedError(413, 'upload_limit_exceeded', 'The request exceeds the configured upload limit.');
	}
	if (message.includes('not_found')) {
		return getMappedError(404, getStableCode(error, message), 'The requested resource was not found.');
	}
	return getMappedError(500, 'internal_error', 'The server could not complete the request.');
}

function getMappedError(status: number, code: string, detail: string) {
	return {
		status,
		code,
		title: getStatusTitle(status),
		detail,
		extensions: {}
	};
}

function getExplicitStatus(error: any): number | null {
	const value = Number(error?.status || error?.statusCode || error?.httpStatus || error?.code);
	if (Number.isInteger(value) && value >= 400 && value <= 599) {
		return value;
	}
	return null;
}

function getStableCode(error: any, message: string): string {
	const candidate = String(error?.errorCode || error?.problemCode || error?.code || message || '').trim();
	if (/^[a-z][a-z0-9_]{1,79}$/.test(candidate)) {
		return candidate;
	}
	return 'request_failed';
}

function getStatusTitle(status: number): string {
	const titles = {
		400: 'Bad request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not found',
		409: 'Conflict',
		413: 'Content too large',
		422: 'Unprocessable content',
		423: 'Locked',
		429: 'Too many requests',
		500: 'Internal server error',
		502: 'Bad gateway',
		503: 'Service unavailable'
	};
	return titles[status] || 'Request failed';
}

function getErrorMessage(error: any): string {
	if (error?.message) {
		return String(error.message);
	}
	if (typeof error === 'string') {
		return error;
	}
	return 'request_failed';
}

function setResponseHeader(res: any, name: string, value: any) {
	if (value === undefined || value === null || typeof res.setHeader !== 'function') {
		return;
	}
	res.setHeader(name, String(value));
}
