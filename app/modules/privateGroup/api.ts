import type {IGeesomeApp} from '../../interface.js';
import type IGeesomePrivateGroupModule from './interface.js';
import type {IPrivateGroupMembershipSnapshot} from './interface.js';

export default function registerPrivateGroupApi(
	app: IGeesomeApp,
	module: IGeesomePrivateGroupModule
) {
	/**
	 * @api {get} /v1/private-groups/:groupId/membership Get private-group membership snapshot
	 * @apiName GetPrivateGroupMembership
	 * @apiGroup PrivateGroup
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Returns the latest immutable account/device membership snapshot. Only a current group member or administrator may read it. Public device bundles are returned; browser private keys are never stored or exposed by GeeSome Node.
	 * @apiParam {Number} groupId Private-group database id.
	 * @apiSuccess {Object} snapshot Accepted immutable membership snapshot, or null before the first snapshot exists.
	 * @apiSuccess {String} expectedVersion Version to submit when refreshing membership. It is `0` before the first snapshot.
	 * @apiError (403) not_permitted The authenticated user is not a group member or administrator.
	 * @apiError (404) private_group_required The group is missing or is not a private group.
	 * @apiError (503) private_group_disabled Native private groups are disabled on this node.
	 */
	app.ms.api.onAuthorizedGet('private-groups/:groupId/membership', async (req, res) => {
		const snapshot = await withPrivateGroupApiErrors(
			() => module.getMembershipSnapshot(
				req.user.id,
				req.params.groupId
			)
		);
		res.send(buildMembershipResponse(snapshot), 200);
	});

	/**
	 * @api {post} /v1/private-groups/:groupId/membership Refresh private-group membership snapshot
	 * @apiName RefreshPrivateGroupMembership
	 * @apiGroup PrivateGroup
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Atomically records the current group members and their active signed public device bundles. Only a group administrator may refresh membership. Repeating an unchanged refresh returns the accepted snapshot without creating another version.
	 * @apiParam {Number} groupId Private-group database id.
	 * @apiBody {String} expectedVersion Current accepted version from the read endpoint, or `0` for the first snapshot.
	 * @apiSuccess {Object} snapshot Accepted immutable membership snapshot.
	 * @apiSuccess {String} expectedVersion Accepted version to use for the next refresh or private post.
	 * @apiError (403) not_permitted The authenticated user is not a group administrator.
	 * @apiError (404) private_group_required The group is missing or is not a private group.
	 * @apiError (409) private_group_membership_version_conflict Membership changed after the supplied version was read.
	 * @apiError (422) private_group_member_device_required A group member has no active registered browser device.
	 * @apiError (422) private_group_membership_version_invalid The supplied version is invalid.
	 * @apiError (503) private_group_disabled Native private groups are disabled on this node.
	 */
	app.ms.api.onAuthorizedPost('private-groups/:groupId/membership', async (req, res) => {
		assertExpectedVersion(req.body.expectedVersion);
		const snapshot = await withPrivateGroupApiErrors(
			() => module.createMembershipSnapshot(
				req.user.id,
				req.params.groupId,
				req.body.expectedVersion
			)
		);
		res.send(buildMembershipResponse(snapshot), 200);
	});
}

function buildMembershipResponse(snapshot: IPrivateGroupMembershipSnapshot | null) {
	return {
		snapshot,
		expectedVersion: snapshot?.version || '0'
	};
}

function assertExpectedVersion(value) {
	if (value === undefined || value === null || value === '') {
		const error: any = new Error('private_group_membership_version_invalid');
		error.code = 422;
		throw error;
	}
}

async function withPrivateGroupApiErrors<T>(callback: () => Promise<T>): Promise<T> {
	try {
		return await callback();
	} catch (error) {
		const apiError: any = error;
		const statusCode = privateGroupApiErrorStatus[apiError?.message];
		if (statusCode) {
			apiError.code = statusCode;
		}
		throw apiError;
	}
}

const privateGroupApiErrorStatus = {
	not_permitted: 403,
	private_group_required: 404,
	private_group_membership_version_conflict: 409,
	private_group_id_invalid: 422,
	private_group_membership_version_invalid: 422,
	private_group_member_device_required: 422,
	private_group_disabled: 503,
	private_group_membership_dependencies_unavailable: 503,
	private_group_membership_models_unavailable: 503
};
