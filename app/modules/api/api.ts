import IGeesomeApiModule from "./interface";
import {ContentMimeType, CorePermissionName, UserLimitName} from "../database/interface";
const request = require('request');
const Busboy = require('busboy');
const _ = require('lodash');
const ipfsHelper = require('geesome-libs/src/ipfsHelper');

module.exports = (app, module: IGeesomeApiModule) => {
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

	module.onGet('self-account-id', async (req, res) => {
		res.send({ result: await app.getSelfAccountId() }, 200);
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

	module.onAuthorizedGet('user/permissions/core/is-have/:permissionName', async (req, res) => {
		res.send({result: await app.ms.database.isHaveCorePermission(req.user.id, req.params.permissionName)});
	});

	module.onAuthorizedPost('user/update', async (req, res) => {
		res.send(await app.updateUser(req.user.id, req.body));
	});

	module.onAuthorizedPost('user/set-account', async (req, res) => {
		res.send(await app.setUserAccount(req.user.id, req.body));
	});

	module.onAuthorizedGet('user/api-key-list', async (req, res) => {
		res.send(await app.getUserApiKeys(req.user.id, req.query.isDisabled, req.query.search, req.query), 200);
	});

	module.onAuthorizedPost('user/api-key/add', async (req, res) => {
		res.send(await app.generateUserApiKey(req.user.id, req.body));
	});

	module.onAuthorizedPost('user/api-key/:userApiKeyId/update', async (req, res) => {
		res.send(await app.updateApiKey(req.user.id, req.params.userApiKeyId, req.body));
	});

	/**
	 * @api {post} user/save-file Save file
	 * @apiDescription Store file from browser by FormData class in "file" field. Other fields can be stored as key value.
	 * @apiName UserSaveFile
	 * @apiGroup UserContent
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IFileContentInput} apiParam
	 *
	 * @apiInterface (../database/interface.ts) {IContent} apiSuccess
	 */
	module.onAuthorizedPost('user/save-file', async (req, res) => {
		const busboy = new Busboy({
			headers: req.headers,
			limits: {
				fileSize: await app.getUserLimitRemained(req.user.id, UserLimitName.SaveContentSize)
			}
		});

		const body = {};
		busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
			body[fieldname] = val;
		});
		busboy.on('file', async function (fieldname, file, filename) {
			const options = {
				userId: req.user.id,
				userApiKeyId: req.apiKey.id,
				..._.pick(body, ['driver', 'groupId', 'folderId', 'path', 'async'])
			};

			const asyncOperationRes = await app.ms.asyncOperation.asyncOperationWrapper('saveData', [file, filename, options], options);
			res.send(asyncOperationRes);
		});

		req.stream.pipe(busboy);
	});

	/**
	 * @api {post} user/save-data Save data
	 * @apiDescription Store data (string or buffer)
	 * @apiName UserSaveData
	 * @apiGroup UserContent
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IDataContentInput} apiParam
	 *
	 * @apiInterface (../database/interface.ts) {IContent} apiSuccess
	 */
	module.onAuthorizedPost('user/save-data', async (req, res) => {
		const options = {
			userId: req.user.id,
			userApiKeyId: req.apiKey.id,
			..._.pick(req.body, ['groupId', 'folderId', 'mimeType', 'path', 'async', 'driver'])
		};

		res.send(await app.ms.asyncOperation.asyncOperationWrapper('saveData', [req.body['content'], req.body['fileName'] || req.body['name'], options], options));
	});

	/**
	 * @api {post} user/save-data-by-url Save data by url
	 * @apiDescription Download and store data by url
	 * @apiName UserSaveDataByUrl
	 * @apiGroup UserContent
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IUrlContentInput} apiParam
	 *
	 * @apiInterface (../database/interface.ts) {IContent} apiSuccess
	 */
	module.onAuthorizedPost('user/save-data-by-url', async (req, res) => {
		const options = {
			userId: req.user.id,
			userApiKeyId: req.apiKey.id,
			..._.pick(req.body, ['groupId', 'driver', 'folderId', 'mimeType', 'path', 'async'])
		};

		res.send(await app.ms.asyncOperation.asyncOperationWrapper('saveDataByUrl', [req.body['url'], options], options));
	});

	/**
	 * @api {post} user/save-directory Save directory
	 * @apiDescription Store directory content
	 * @apiName UserSaveDirectory
	 * @apiGroup UserContent
	 *
	 * @apiUse ApiKey
	 *
	 * @apiInterface (../../interface.ts) {IDataContentInput} apiParam
	 *
	 * @apiInterface (../database/interface.ts) {IContent} apiSuccess
	 */
	module.onAuthorizedPost('user/save-directory', async (req, res) => {
		const options = {
			userId: req.user.id,
			userApiKeyId: req.apiKey.id,
			..._.pick(req.body, ['groupId', 'async', 'driver'])
		};

		res.send(await app.ms.asyncOperation.asyncOperationWrapper('saveDirectoryToStorage', [req.user.id, req.body['path'], options], options));
	});

	//TODO: add limit for this action

	// module.onAuthorizedPost('user/regenerate-previews', async (req, res) => {
	//   res.send(await app.regenerateUserContentPreviews(req.user.id));
	// });

	//TODO: move permissions checks to app class
	module.onAuthorizedPost('admin/add-user', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUser)) {
			return res.send(403);
		}
		if (req.body.permissions && !await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.registerUser(req.body));
	});
	module.onAuthorizedPost('admin/add-user-api-key', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
			return res.send(403);
		}
		res.send(await app.generateUserApiKey(req.body.userId, req.body, true));
	});
	module.onAuthorizedGet('admin/get-user-by-api-key/:apiKey', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		res.send(await app.getUserByApiKey(req.params.apiKey).then(({user}) => user));
	});
	module.onAuthorizedPost('admin/set-user-limit', async (req, res) => {
		res.send(await app.setUserLimit(req.user.id, req.body));
	});

	module.onAuthorizedPost('admin/permissions/core/add_permission', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.addCorePermission(req.body.userId, req.body.permissionName));
	});

	module.onAuthorizedPost('admin/permissions/core/remove_permission', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.removeCorePermission(req.body.userId, req.body.permissionName));
	});

	module.onAuthorizedPost('admin/permissions/core/get_list', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
			return res.send(403);
		}
		res.send(await app.ms.database.getCorePermissions(req.body.userId));
	});

	module.onAuthorizedGet('admin/all-users', async (req, res) => {
		res.send(await app.getAllUserList(req.user.id, req.query.search, req.query));
	});
	module.onAuthorizedGet('admin/all-content', async (req, res) => {
		res.send(await app.getAllContentList(req.user.id, req.query.search, req.query));
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

	module.onAuthorizedPost('admin/get-user-account', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		res.send(await app.ms.database.getUserAccountByAddress(req.body.provider, req.body.address));
	});

	module.onAuthorizedGet('admin/get-user/:userId/limit/:limitName', async (req, res) => {
		if (!await app.ms.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		const limit: any = JSON.parse(JSON.stringify(await app.getUserLimit(req.user.id, req.params.userId, req.params.limitName)));
		if (limit) {
			limit.remained = await app.getUserLimitRemained(req.params.userId, req.params.limitName);
		}
		res.send(limit);
	});

	module.onGet('content/:contentId', async (req, res) => {
		res.send(await app.getContent(req.params.contentId));
	});

	module.onGet('content-by-storage-id/:contentStorageId', async (req, res) => {
		res.send(await app.getContentByStorageId(req.params.contentStorageId));
	});

	module.onGet('content-stats/*', async (req, res) => {
		const dataPath = req.route.replace('content-stats/', '');
		return app.ms.storage.getFileStat(dataPath).then(d => res.send(d));
	});

	module.onGet('content-data/*', async (req, res) => {
		const dataPath = req.route.replace('content-data/', '');
		getFileStream(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
	});

	module.onGet('/ipfs/*', async (req, res) => {
		const ipfsPath = req.route.replace('/ipfs/', '');
		getFileStream(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
	});

	module.onHead('content-data/*', async (req, res) => {
		const dataPath = req.route.replace('content-data/', '');
		getContentHead(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
	});

	module.onHead('/ipfs/*', async (req, res) => {
		const ipfsPath = req.route.replace('/ipfs/', '');
		getContentHead(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
	});

	async function getContentHead(req, res, hash) {
		module.setDefaultHeaders(res);
		const content = await app.ms.database.getContentByStorageId(hash, true);
		if (content) {
			res.setHeader('Content-Type', content.storageId === hash ? content.mimeType : content.previewMimeType);
			res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
		}
		res.send(200);
	}

	async function getFileStream(req, res, dataPath) {
		module.setStorageHeaders(res);

		dataPath = _.trimStart(dataPath, '/')

		let splitPath = dataPath.split('.');
		console.log('isIpfsHash', splitPath[0]);
		if (ipfsHelper.isIpfsHash(splitPath[0])) {
			// cut extension, TODO: use regex
			dataPath = splitPath[0];
		}

		let range = req.headers['range'];
		if (!range) {
			let content = await app.ms.database.getContentByStorageId(dataPath, false);
			if (!content && dataPath.split('/').length > 1) {
				content = await app.ms.database.getContentByStorageId(dataPath.split('/')[0], false);
			}
			if (content) {
				console.log('content.mimeType', dataPath, content.mimeType);
				const contentType = content.storageId === dataPath ? content.mimeType : content.previewMimeType;
				if (contentType) {
					res.setHeader('Content-Type', contentType);
				}
				if (content.mimeType === ContentMimeType.Directory && !_.includes(_.last(dataPath.split('/')), '.')) {
					dataPath += '/index.html';
				}
			}
			return app.getFileStream(dataPath).then((stream) => {
				stream.pipe(res.stream);
			});
		}

		const content = await app.getContentByStorageId(dataPath);
		console.log('content.mimeType', dataPath, content.mimeType);

		if (content.mimeType === ContentMimeType.Directory) {
			dataPath += '/index.html';
		}

		let dataSize = content ? content.size : null;
		// if (!dataSize) {
		//   console.log('dataSize is null', dataPath, dataSize);
		//TODO: check if some size not correct
		const stat = await app.ms.storage.getFileStat(dataPath);
		dataSize = stat.size;
		// }

		console.log('dataSize', dataSize);

		let chunkSize = 1024 * 1024;
		if(dataSize > chunkSize * 2) {
			chunkSize = Math.ceil(dataSize * 0.25);
		}

		range = range.replace(/bytes=/, "").split("-");

		range[0] = range[0] ? parseInt(range[0], 10) : 0;
		range[1] = range[1] ? parseInt(range[1], 10) : range[0] + chunkSize;
		if(range[1] > dataSize - 1) {
			range[1] = dataSize - 1;
		}
		range = {start: range[0], end: range[1]};

		const contentLength = range.end - range.start + 1;

		const fileStreamOptions = {
			offset: range.start,
			length: contentLength
		};

		return app.getFileStream(dataPath, fileStreamOptions).then((stream) => {
			//
			let resultLength = 0;
			stream.on('data', (data) => {
				resultLength += data.length;
			});
			stream.on('end', (data) => {
				console.log('range.start', range.start);
				console.log('contentLength', contentLength);
				console.log('resultLength ', resultLength);
				console.log(range.start + contentLength, '/', dataSize);
				console.log(range.start + resultLength, '/', dataSize);
			});

			let mimeType = '';
			if(content) {
				mimeType = content.storageId === dataPath ? content.mimeType : content.previewMimeType;
			}
			res.writeHead(206, {
				// 'Cache-Control': 'no-cache, no-store, must-revalidate',
				// 'Pragma': 'no-cache',
				// 'Expires': 0,
				'Cross-Origin-Resource-Policy': 'cross-origin',
				'Content-Type': mimeType,
				'Accept-Ranges': 'bytes',
				'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + dataSize,
				'Content-Length': contentLength
			});
			stream.pipe(res.stream);
		});
	}

	module.onGet('/ipns/*', async (req, res) => {
		// console.log('ipns req.route', req.route);
		const ipnsPath = req.route.replace('/ipns/', '').split('?')[0];
		const ipnsId = _.trim(ipnsPath, '/').split('/').slice(0, 1)[0];
		const ipfsId = await app.resolveStaticId(ipnsId);

		// console.log('ipnsPath', ipnsPath);
		// console.log('ipfsPath', ipnsPath.replace(ipnsId, ipfsId));

		getFileStream(req, res, ipnsPath.replace(ipnsId, ipfsId)).catch((e) => {console.error(e); res.send(400)});
	});

	module.onGet('/resolve/:storageId', async (req, res) => {
		app.resolveStaticId(req.params.storageId).then(res.send.bind(res)).catch((err) => {
			res.send(err.message, 500)
		})
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
			result: req.query.type === 'ipfs' ? await app.ms.storage.nodeAddressList() : await app.ms.communicator.nodeAddressList()
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

	if (app.frontendStorageId) {
		module.onGet('/node*', async (req, res) => {
			if (req.route === '/node') {
				return res.redirect('/node/');
			}
			let path = req.route.replace('/node', '');
			if (!path || path === '/') {
				path = '/index.html';
			}
			getFileStream(req, res, app.frontendStorageId + path).catch((e) => {console.error(e); res.send(400)});
		});
	}
}