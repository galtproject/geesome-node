import {inviteErrors, isInviteApiError} from "./errors.js";

const DEFAULT_WINDOW_SECONDS = 10 * 60;
const DEFAULT_STATUS_LIMIT = 30;
const DEFAULT_FAILED_JOIN_LIMIT = 10;

const inviteStatusLimiter = createIpRateLimiter({
	limit: getPositiveIntegerEnv('GEESOME_INVITE_STATUS_RATE_LIMIT_COUNT', DEFAULT_STATUS_LIMIT),
	windowSeconds: getPositiveIntegerEnv('GEESOME_INVITE_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_WINDOW_SECONDS)
});

const inviteFailedJoinLimiter = createIpRateLimiter({
	limit: getPositiveIntegerEnv('GEESOME_INVITE_FAILED_JOIN_RATE_LIMIT_COUNT', DEFAULT_FAILED_JOIN_LIMIT),
	windowSeconds: getPositiveIntegerEnv('GEESOME_INVITE_RATE_LIMIT_WINDOW_SECONDS', DEFAULT_WINDOW_SECONDS)
});

export function assertInviteStatusRateLimit(ipAddress) {
	inviteStatusLimiter.recordOrThrow(ipAddress);
}

export function assertInviteFailedJoinRateLimit(ipAddress) {
	inviteFailedJoinLimiter.throwIfLimited(ipAddress);
}

export function recordFailedInviteJoin(ipAddress) {
	inviteFailedJoinLimiter.record(ipAddress);
}

export function isInviteRateLimitError(error) {
	return isInviteApiError(error) && error.publicCode === 'invite_rate_limited';
}

export function getInviteRequestIp(req) {
	const forwardedFor = req.headers?.['x-forwarded-for'];
	if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
		return forwardedFor.split(',')[0].trim();
	}
	if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
		return String(forwardedFor[0]).split(',')[0].trim();
	}
	return req.stream?.ip || req.stream?.socket?.remoteAddress || 'unknown';
}

function createIpRateLimiter({limit, windowSeconds}) {
	const attemptsByIp = new Map();
	const windowMs = windowSeconds * 1000;

	function prune(ipAddress, now) {
		const attempts = attemptsByIp.get(ipAddress) || [];
		const freshAttempts = attempts.filter((timestamp) => now - timestamp < windowMs);
		if (freshAttempts.length) {
			attemptsByIp.set(ipAddress, freshAttempts);
		} else {
			attemptsByIp.delete(ipAddress);
		}
		return freshAttempts;
	}

	function throwIfLimited(ipAddress) {
		if (limit <= 0) {
			return;
		}
		const attempts = prune(ipAddress, Date.now());
		if (attempts.length >= limit) {
			throw inviteErrors.rateLimited(windowSeconds);
		}
	}

	function record(ipAddress) {
		if (limit <= 0) {
			return;
		}
		const now = Date.now();
		const attempts = prune(ipAddress, now);
		attempts.push(now);
		attemptsByIp.set(ipAddress, attempts);
	}

	return {
		record,
		throwIfLimited,
		recordOrThrow(ipAddress) {
			throwIfLimited(ipAddress);
			record(ipAddress);
		}
	};
}

function getPositiveIntegerEnv(name, fallback) {
	const value = Number(process.env[name]);
	if (Number.isInteger(value) && value >= 0) {
		return value;
	}
	return fallback;
}
