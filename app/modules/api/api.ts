import IGeesomeApiModule from "./interface";
import {CorePermissionName} from "../database/interface";
import {IGeesomeApp} from "../../interface";
const request = require('request');
const _ = require('lodash');

module.exports = (app: IGeesomeApp, module: IGeesomeApiModule) => {
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
	 * @api {get} is-empty Request Node status
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
	 * @api {post} setup Setup first admin user
	 * @apiName RunSetup
	 * @apiGroup Setup
	 *
	 * @apiInterface (../../interface.ts) {IUserInput} apiParam
	 * @apiInterface (../database/interface.ts) {IUser} apiSuccess
	 */
	module.onPost('setup', async (req, res) => {
		res.send(await app.setup(req.body), 200);
	});

	/**
	 * @api {post} login/password Login by password
	 * @apiName LoginPassword
	 * @apiGroup Login
	 *
	 * @apiParam {String} login
	 * @apiParam {String} password
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
	 * @api {get} user Get current user
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

	module.onAuthorizedPost('get-user-by-api-token', async (req, res) => {
		res.send(await app.getUserByApiToken(req.body.token));
	});

	module.onAuthorizedGet('user/permissions/core/is-have/:permissionName', async (req, res) => {
		res.send({result: await app.isUserCan(req.user.id, req.params.permissionName)});
	});

	module.onAuthorizedPost('user/update', async (req, res) => {
		res.send(await app.updateUser(req.user.id, req.body));
	});

	module.onAuthorizedGet('user/api-key-list', async (req, res) => {
		res.send(await app.getUserApiKeys(req.user.id, req.query.isDisabled, req.query.search, req.query), 200);
	});

	module.onAuthorizedGet('user/api-key/current', async (req, res) => {
		res.send(req.apiKey);
	});

	module.onAuthorizedPost('user/api-key/add', async (req, res) => {
		res.send(await app.generateUserApiKey(req.user.id, req.body));
	});

	module.onAuthorizedPost('user/api-key/:userApiKeyId/update', async (req, res) => {
		res.send(await app.updateApiKey(req.user.id, req.params.userApiKeyId, req.body));
	});

	//TODO: add limit for this action

	// module.onAuthorizedPost('user/regenerate-previews', async (req, res) => {
	//   res.send(await app.regenerateUserContentPreviews(req.user.id));
	// });

	//TODO: move permissions checks to app class
	module.onAuthorizedPost('admin/add-user', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminAddUser)) {
			return res.send(403);
		}
		if (req.body.permissions && !await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.registerUser(req.body));
	});
	module.onAuthorizedPost('admin/add-user-api-key', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
			return res.send(403);
		}
		res.send(await app.generateUserApiKey(req.body.userId, req.body, true));
	});
	module.onAuthorizedPost('admin/set-user-limit', async (req, res) => {
		res.send(await app.setUserLimit(req.user.id, req.body));
	});

	module.onAuthorizedPost('admin/permissions/core/add_permission', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.addCorePermission(req.body.userId, req.body.permissionName));
	});

	module.onAuthorizedPost('admin/permissions/core/remove_permission', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.removeCorePermission(req.body.userId, req.body.permissionName));
	});

	module.onAuthorizedPost('admin/permissions/core/get_list', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.getCorePermissions(req.body.userId));
	});

	module.onAuthorizedGet('admin/all-users', async (req, res) => {
		res.send(await app.getAllUserList(req.user.id, req.query.search, req.query));
	});


	module.onAuthorizedGet('admin/boot-nodes', async (req, res) => {
		res.send(await app.getBootNodes(req.user.id, req.query.type));
	});

	module.onAuthorizedPost('admin/boot-nodes/add', async (req, res) => {
		res.send(await app.addBootNode(req.user.id, req.body.address, req.body.type));
	});

	module.onAuthorizedPost('admin/boot-nodes/remove', async (req, res) => {
		res.send(await app.removeBootNode(req.user.id, req.body.address, req.body.type));
	});

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

	module.onGet('/ipld/*', async (req, res) => {
		module.setStorageHeaders(res);
		const ipldPath = req.route.replace('/ipld/', '');
		app.getDataStructure(ipldPath, req.query.isResolve).then(result => {
			res.send(_.isNumber(result) ? result.toString() : result);
		}).catch(() => {
			res.send(null, 200)
		});
	});

	module.onGet('node-address-list', async (req, res) => {
		res.send({
			result: req.query.type === 'ipfs' ? await app.ms.storage.remoteNodeAddressList([]) : await app.ms.communicator.nodeAddressList()
		});
	});

	module.onGet('/api/v0/refs*', (req, res) => {
		module.setStorageHeaders(res);
		request('http://localhost:5002/api/v0/refs' + req.route.split('/api/v0/refs')[1]).pipe(res.stream);
	});

	module.onAuthorizedPost('/save-object', async (req, res) => {
		app.saveDataStructure(req.body).then((result) => {
			res.send(result);
		}).catch(() => {
			res.send(null, 500)
		});
	});
}