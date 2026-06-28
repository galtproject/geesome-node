export type InviteApiErrorInput = {
	publicCode: string;
	message: string;
	statusCode: number;
	agentAction: string;
	retryable?: boolean;
	retryAfterSeconds?: number;
};

export class InviteApiError extends Error {
	publicCode: string;
	statusCode: number;
	agentAction: string;
	retryable: boolean;
	retryAfterSeconds?: number;

	constructor(input: InviteApiErrorInput) {
		super(input.message);
		this.publicCode = input.publicCode;
		this.statusCode = input.statusCode;
		this.agentAction = input.agentAction;
		this.retryable = input.retryable || false;
		this.retryAfterSeconds = input.retryAfterSeconds;
	}
}

export const inviteErrors = {
	notFound() {
		return new InviteApiError({
			publicCode: 'invite_not_found',
			message: 'invite_not_found',
			statusCode: 404,
			agentAction: 'try_next_invite'
		});
	},

	notActive() {
		return new InviteApiError({
			publicCode: 'invite_not_active',
			message: 'invite_not_active',
			statusCode: 410,
			agentAction: 'try_next_invite'
		});
	},

	exhausted() {
		return new InviteApiError({
			publicCode: 'invite_exhausted',
			message: 'invite_max_count',
			statusCode: 410,
			agentAction: 'try_next_invite'
		});
	},

	missingUploadPermission(requiredPermission) {
		return new InviteApiError({
			publicCode: 'invite_missing_upload_permission',
			message: `Invite does not grant ${requiredPermission}.`,
			statusCode: 422,
			agentAction: 'use_upload_scoped_invite_or_existing_admin_user_provisioning'
		});
	},

	invalidPermissions() {
		return new InviteApiError({
			publicCode: 'invite_permissions_invalid',
			message: 'Invite permissions are not valid JSON.',
			statusCode: 422,
			agentAction: 'replace_invite_or_recreate_with_valid_permissions'
		});
	},

	joinNotPermitted() {
		return new InviteApiError({
			publicCode: 'invite_join_not_permitted',
			message: 'Invite join is not permitted on this node.',
			statusCode: 403,
			agentAction: 'check_invite_join_configuration_or_use_existing_admin_user_provisioning'
		});
	},

	rateLimited(retryAfterSeconds) {
		return new InviteApiError({
			publicCode: 'invite_rate_limited',
			message: 'Too many invite attempts from this IP address.',
			statusCode: 429,
			agentAction: 'retry_after_rate_limit_window',
			retryable: true,
			retryAfterSeconds
		});
	}
};

export function isInviteApiError(error): error is InviteApiError {
	return error instanceof InviteApiError;
}

export function normalizeInviteApiError(error) {
	if (isInviteApiError(error)) {
		return error;
	}

	const message = getErrorMessage(error);
	if (message === 'not_permitted' || message.includes('not_permitted')) {
		return inviteErrors.joinNotPermitted();
	}

	return null;
}

export function inviteApiErrorBody(error: InviteApiError) {
	const body: any = {
		error: {
			code: error.publicCode,
			message: error.message,
			retryable: error.retryable,
			agentAction: error.agentAction
		}
	};
	if (error.retryAfterSeconds) {
		body.error.retryAfterSeconds = error.retryAfterSeconds;
	}
	return body;
}

function getErrorMessage(error) {
	if (error && error.message) {
		return error.message;
	}
	return String(error);
}
