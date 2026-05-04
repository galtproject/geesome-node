import IGeesomeApiModule from "./interface.js";
import {CorePermissionName} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import http from 'node:http';
import _ from 'lodash';
const {isNumber} = _;

export default (app: IGeesomeApp, module: IGeesomeApiModule) => {
	//TODO: move to core module

	// v1 route
	module.onGet('', async (req, res) => {
		//TODO: output api docs
	});

	/**
	 * @apiDefine ApiKey
	 *
	 * @apiHeader {String} Authorization "Bearer " + Api key from login/* response
	 */

	/**
	 * @api {get} /v1/is-empty Request Node status
	 * @apiName IsEmpty
	 * @apiGroup Setup
	 *
	 * @apiSuccess {Boolean} result Node is empty or not.
	 */
	module.onGet('is-empty', async (req, res) => {
		res.send({
			result: (await app.ms.database.getUsersCount()) === 0
		}, 200);
	});

	/**
	 * @api {post} /v1/setup Setup first admin user
	 * @apiName RunSetup
	 * @apiGroup Setup
	 *
	 * @apiInterface (../../interface.ts) {IUserInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onPost('setup', async (req, res) => {
		res.send(await app.setup(req.body), 200);
	});

	/**
	 * @api {post} /v1/login/password Login by password
	 * @apiName LoginPassword
	 * @apiGroup Login
	 *
	 * @apiBody {String} username
	 * @apiBody {String} password
	 *
	 * @apiInterface (../../interface.ts) {IUserAuthResponse} apiSuccess
	 */
	module.onPost('login/password', async (req, res) => {
		app.loginPassword(req.body.username, req.body.password)
			.then(user => module.handleAuthResult(res, user))
			.catch((err) => {
				console.error(err);
				res.send(403)
			});
	});

	/**
	 * @api {get} /v1/user Get current user
	 * @apiName UserCurrent
	 * @apiGroup User
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onAuthorizedGet('user', async (req, res) => {
		if (!req.user || !req.user.id) {
			return res.send(401);
		}
		res.send(req.user, 200);
	});

	/**
	 * @api {post} /v1/get-user-by-api-token Resolve user by API token
	 * @apiName GetUserByApiToken
	 * @apiGroup User
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {ITokenInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onAuthorizedPost('get-user-by-api-token', async (req, res) => {
		res.send(await app.getUserByApiToken(req.body.token));
	});

	/**
	 * @api {get} /v1/user/permissions/core/is-have/:permissionName Check current user permission
	 * @apiName UserCorePermissionIsHave
	 * @apiGroup User
	 *
	 * @apiUse ApiKey
	 *
	 * @apiParam {String} permissionName Core permission name.
	 * @apiInterface (../../interface.ts) {IBooleanResultResponse} apiSuccess
	 */
	module.onAuthorizedGet('user/permissions/core/is-have/:permissionName', async (req, res) => {
		res.send({result: await app.isUserCan(req.user.id, req.params.permissionName)});
	});

	/**
	 * @api {post} /v1/user/update Update current user
	 * @apiName UserUpdate
	 * @apiGroup User
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserUpdateInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onAuthorizedPost('user/update', async (req, res) => {
		res.send(await app.updateUser(req.user.id, req.body));
	});

	/**
	 * @api {get} /v1/user/api-key-list List current user API keys
	 * @apiName UserApiKeyList
	 * @apiGroup UserApiKey
	 *
	 * @apiUse ApiKey
	 *
	 * @apiQuery {Boolean} isDisabled
	 * @apiQuery {String} search
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiInterface (../../interface.ts) {IUserApiKeysListResponse} apiSuccess
	 */
	module.onAuthorizedGet('user/api-key-list', async (req, res) => {
		res.send(await app.getUserApiKeys(req.user.id, req.query.isDisabled, req.query.search, req.query), 200);
	});

	/**
	 * @api {get} /v1/user/api-key/current Get current API key
	 * @apiName UserApiKeyCurrent
	 * @apiGroup UserApiKey
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../database/interface.ts) {IUserApiKey} apiSuccess
	 */
	module.onAuthorizedGet('user/api-key/current', async (req, res) => {
		res.send(req.apiKey);
	});

	/**
	 * @api {post} /v1/user/api-key/add Create user API key
	 * @apiName UserApiKeyAdd
	 * @apiGroup UserApiKey
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserApiKeyInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUserApiKey} apiSuccess
	 */
	module.onAuthorizedPost('user/api-key/add', async (req, res) => {
		res.send(await app.generateUserApiKey(req.user.id, req.body));
	});

	/**
	 * @api {post} /v1/user/api-key/:userApiKeyId/update Update user API key
	 * @apiName UserApiKeyUpdate
	 * @apiGroup UserApiKey
	 *
	 * @apiUse ApiKey
	 *
	 * @apiParam {Number} userApiKeyId API key id.
	 * @apiInterface (../../interface.ts) {IUserApiKeyInput} apiBody
	 */
	module.onAuthorizedPost('user/api-key/:userApiKeyId/update', async (req, res) => {
		res.send(await app.updateApiKey(req.user.id, req.params.userApiKeyId, req.body));
	});

	//TODO: add limit for this action

	// module.onAuthorizedPost('user/regenerate-previews', async (req, res) => {
	//   res.send(await app.regenerateUserContentPreviews(req.user.id));
	// });

	//TODO: move permissions checks to app class
	/**
	 * @api {post} /v1/admin/add-user Add user
	 * @apiName AdminAddUser
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onAuthorizedPost('admin/add-user', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminAddUser)) {
			return res.send(403);
		}
		if (req.body.permissions && !await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.registerUser(req.body));
	});
	/**
	 * @api {post} /v1/admin/add-user-api-key Add API key for user
	 * @apiName AdminAddUserApiKey
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserIdInput} apiBody
	 * @apiInterface (../../interface.ts) {IUserApiKeyInput} apiBody
	 * @apiInterface (../database/interface.ts) {IUserApiKey} apiSuccess
	 */
	module.onAuthorizedPost('admin/add-user-api-key', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
			return res.send(403);
		}
		res.send(await app.generateUserApiKey(req.body.userId, req.body, true));
	});
	/**
	 * @api {post} /v1/admin/set-user-limit Set user limit
	 * @apiName AdminSetUserLimit
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserLimitInput} apiBody
	 */
	module.onAuthorizedPost('admin/set-user-limit', async (req, res) => {
		res.send(await app.setUserLimit(req.user.id, req.body));
	});

	/**
	 * @api {post} /v1/admin/permissions/core/add_permission Add user core permission
	 * @apiName AdminCorePermissionAdd
	 * @apiGroup AdminPermission
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {ICorePermissionInput} apiBody
	 */
	module.onAuthorizedPost('admin/permissions/core/add_permission', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.addCorePermission(req.body.userId, req.body.permissionName));
	});

	/**
	 * @api {post} /v1/admin/permissions/core/remove_permission Remove user core permission
	 * @apiName AdminCorePermissionRemove
	 * @apiGroup AdminPermission
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {ICorePermissionInput} apiBody
	 */
	module.onAuthorizedPost('admin/permissions/core/remove_permission', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.removeCorePermission(req.body.userId, req.body.permissionName));
	});

	/**
	 * @api {post} /v1/admin/permissions/core/set_permissions Set user core permissions
	 * @apiName AdminCorePermissionSet
	 * @apiGroup AdminPermission
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {ICorePermissionListInput} apiBody
	 */
	module.onAuthorizedPost('admin/permissions/core/set_permissions', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.setCorePermissions(req.body.userId, req.body.permissionNameList));
	});

	/**
	 * @api {post} /v1/admin/permissions/core/get_list Get user core permissions
	 * @apiName AdminCorePermissionList
	 * @apiGroup AdminPermission
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUserIdInput} apiBody
	 * @apiSuccess {Object[]} list Core permission items.
	 */
	module.onAuthorizedPost('admin/permissions/core/get_list', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.getCorePermissions(req.body.userId));
	});

	/**
	 * @api {get} /v1/admin/all-users List users
	 * @apiName AdminAllUsers
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IListQueryInput} apiQuery
	 * @apiInterface (../../interface.ts) {IUserListResponse} apiSuccess
	 */
	module.onAuthorizedGet('admin/all-users', async (req, res) => {
		res.send(await app.getAllUserList(req.user.id, req.query.search, req.query));
	});


	/**
	 * @api {get} /v1/admin/boot-nodes List boot nodes
	 * @apiName AdminBootNodes
	 * @apiGroup AdminNode
	 *
	 * @apiUse ApiKey
	 *
	 * @apiQuery {String} type
	 * @apiSuccess {String[]} list Boot node addresses.
	 */
	module.onAuthorizedGet('admin/boot-nodes', async (req, res) => {
		res.send(await app.getBootNodes(req.user.id, req.query.type));
	});

	/**
	 * @api {post} /v1/admin/boot-nodes/add Add boot node
	 * @apiName AdminBootNodeAdd
	 * @apiGroup AdminNode
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IBootNodeInput} apiBody
	 */
	module.onAuthorizedPost('admin/boot-nodes/add', async (req, res) => {
		res.send(await app.addBootNode(req.user.id, req.body.address, req.body.type));
	});

	/**
	 * @api {post} /v1/admin/boot-nodes/remove Remove boot node
	 * @apiName AdminBootNodeRemove
	 * @apiGroup AdminNode
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IBootNodeInput} apiBody
	 */
	module.onAuthorizedPost('admin/boot-nodes/remove', async (req, res) => {
		res.send(await app.removeBootNode(req.user.id, req.body.address, req.body.type));
	});

	/**
	 * @api {get} /v1/admin/get-user/:userId/limit/:limitName Get user limit
	 * @apiName AdminGetUserLimit
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 *
	 * @apiParam {Number} userId User id.
	 * @apiParam {String} limitName Limit name.
	 * @apiInterface (../database/interface.ts) {IUserLimit} apiSuccess
	 */
	module.onAuthorizedGet('admin/get-user/:userId/limit/:limitName', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		const limit: any = JSON.parse(JSON.stringify(await app.getUserLimit(req.user.id, req.params.userId, req.params.limitName)));
		if (limit) {
			limit.remained = await app.getUserLimitRemained(req.params.userId, req.params.limitName);
		}
		res.send(limit);
	});

	/**
	 * @api {get} /v1/ipld/* Resolve IPLD data
	 * @apiName IpldResolve
	 * @apiGroup Storage
	 *
	 * @apiQuery {Boolean} isResolve Resolve nested links.
	 */
	module.onGet('/ipld/*', async (req, res) => {
		module.setStorageHeaders(res);
		const ipldPath = req.route.replace('/ipld/', '');
		app.getDataStructure(ipldPath, req.query.isResolve).then(result => {
			res.send(isNumber(result) ? result.toString() : result);
		}).catch(() => {
			res.send(null, 200)
		});
	});

	/**
	 * @api {get} /v1/node-address-list List node addresses
	 * @apiName NodeAddressList
	 * @apiGroup Node
	 *
	 * @apiQuery {String} type Use "ipfs" for IPFS peers, otherwise communicator peers are returned.
	 * @apiInterface (../../interface.ts) {INodeAddressListResponse} apiSuccess
	 */
	module.onGet('node-address-list', async (req, res) => {
		res.send({
			result: req.query.type === 'ipfs' ? await app.ms.storage.remoteNodeAddressList([]) : await app.ms.communicator.nodeAddressList()
		});
	});

	/**
	 * @api {get} /v1/api/v0/refs* Proxy IPFS refs API
	 * @apiName IpfsRefsProxy
	 * @apiGroup Storage
	 *
	 * @apiDescription Compatibility proxy for local IPFS refs calls.
	 */
	module.onGet('/api/v0/refs*', (req, res) => {
		module.setStorageHeaders(res);
		const upstream = http.get('http://localhost:5002/api/v0/refs' + req.route.split('/api/v0/refs')[1], (upstreamRes) => {
			res.writeHead(upstreamRes.statusCode || 500, upstreamRes.headers);
			upstreamRes.pipe(res.stream);
		});
		upstream.on('error', (error) => {
			console.error(error);
			res.send(null, 502);
		});
	});

	/**
	 * @api {post} /v1/save-object Save IPLD object
	 * @apiName SaveObject
	 * @apiGroup Storage
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IStorageObjectInput} apiBody
	 * @apiInterface (../../interface.ts) {IStorageObjectResponse} apiSuccess
	 */
	module.onAuthorizedPost('/save-object', async (req, res) => {
		app.saveDataStructure(req.body).then((result) => {
			res.send(result);
		}).catch(() => {
			res.send(null, 500)
		});
	});
}
