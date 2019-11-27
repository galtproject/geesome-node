/*
 * Copyright ©️ 2019 GaltProject Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2019 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../app/interface";
import {CorePermissionName} from "../../database/interface";

const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const _ = require('lodash');
const mime = require('mime');
const bodyParser = require('body-parser');
const busboy = require('connect-busboy');
const bearerToken = require('express-bearer-token');
const request = require('request');

const service = require('restana')({
  ignoreTrailingSlash: true,
  maxParamLength: 2000,
  errorHandler
});

const maxBodySizeMb = 2000;

module.exports = async (geesomeApp: IGeesomeApp, port) => {
  service.use(bodyParser.json({limit: maxBodySizeMb + 'mb'}));
  service.use(bodyParser.urlencoded({extended: true}));
  service.use(bearerToken());

  service.use(require('morgan')('combined'));

  service.use(async (req, res, next) => {
    setHeaders(res);

    req.query = {};
    if (_.includes(req.url, '?')) {
      const searchParams: any = new URLSearchParams(req.url.split('?')[1]);
      const keys = searchParams.keys();
      for (let key = keys.next(); key.done !== true; key = keys.next()) {
        req.query[key.value] = searchParams.get(key.value);
      }
    }
    res.redirect = (url) => {
      //https://github.com/jkyberneees/ana/issues/16
      res.send('', 301, {
        Location: encodeURI(url)
      });
    };

    if (
      (_.startsWith(req.url, '/v1/user') || _.startsWith(req.url, '/v1/group') || _.startsWith(req.url, '/v1/admin'))
      && !_.startsWith(req.url, '/v1/login')
      && req.method !== 'OPTIONS' && req.method !== 'HEAD'
    ) {
      if (!req.token) {
        return res.send({
          error: "Need authorization token",
          errorCode: 1
        }, 401);
      }

      req.user = await geesomeApp.getUserByApiKey(req.token);

      if (!req.user) {
        return res.send({
          error: "Incorrect api token",
          errorCode: 2
        }, 403);
      }
    }

    next();
  });

  service.use(busboy());

  service.options("/*", function (req, res, next) {
    setHeaders(res);
    res.send(200);
  });
  service.head("/*", function (req, res, next) {
    setHeaders(res);
    res.send(200);
  });

  service.get('/v1', async (req, res) => {
    //TODO: output api docs
  });


  /**
   * @api {get} /v1/is-empty Request Node status
   * @apiName IsEmpty
   * @apiGroup Setup
   *
   * @apiSuccess {Boolean} result Node is empty or not.
   */
  service.get('/v1/is-empty', async (req, res) => {
    res.send({
      result: (await geesomeApp.database.getUsersCount()) === 0
    }, 200);
  });

  /**
   * @api {post} /v1/setup Setup first admin user
   * @apiName RunSetup
   * @apiGroup Setup
   *
   * @apiInterface (../../app/interface.ts) {IUserInput} apiParam
   * @apiInterface (../../database/interface.ts) {IUser} apiSuccess
   */
  service.post('/v1/setup', async (req, res) => {
    res.send(await geesomeApp.setup(req.body), 200);
  });

  async function handleAuthResult(res, user) {
    if (user) {
      return res.send({user, apiKey: await geesomeApp.generateUserApiKey(user.id, {type:"password_auth"})}, 200);
    } else {
      return res.send(403);
    }
  }

  /**
   * @api {post} /v1/login/password Login by password
   * @apiName LoginPassword
   * @apiGroup Login
   *
   * @apiParam {String} login
   * @apiParam {String} password
   *
   * @apiInterface (../../app/interface.ts) {IUserAuthResponse} apiSuccess
   */
  service.post('/v1/login/password', async (req, res) => {
    geesomeApp.loginPassword(req.body.username, req.body.password)
      .then(user => handleAuthResult(res, user))
      .catch((err) => {
        console.error(err);
        res.send(403)
      });
  });

  /**
   * @api {post} /v1/generate-auth-message Generate auth message for sign by account address (Ethereum for example).
   * @apiName GenerateAuthMessage
   * @apiGroup Login
   *
   * @apiParam {String} accountProvider Provider name, "ethereum" for example
   * @apiParam {String} accountAddress
   *
   * @apiInterface (../../app/interface.ts) {IUserAuthMessageResponse} apiSuccess
   */
  service.post('/v1/generate-auth-message', async (req, res) => {
    res.send(await geesomeApp.generateUserAccountAuthMessage(req.body.accountProvider, req.body.accountAddress));
  });

  /**
   * @api {post} /v1/login/password Login by account signature (Ethereum for example).
   * @apiName LoginAuthMessage
   * @apiGroup Login
   *
   * @apiParam {Number} authMessageId Id that got in /v1/generate-auth-message response
   * @apiParam {String} accountAddress
   * @apiParam {String} signature
   * @apiParam {Any} params Special params of provider, {fieldName: String}(field that used in message for signing) in Ethereum.
   *
   * @apiInterface (../../app/interface.ts) {IUserAuthResponse} apiSuccess
   */
  service.post('/v1/login/auth-message', async (req, res) => {
    geesomeApp.loginAuthMessage(req.body.authMessageId, req.body.accountAddress, req.body.signature, req.body.params)
      .then(user => handleAuthResult(res, user))
      .catch((err) => {
        console.error(err);
        res.send(403)
      });
  });

  service.get('/v1/user', async (req, res) => {
    if (!req.user || !req.user.id) {
      return res.send(401);
    }
    res.send(req.user, 200);
  });

  service.post('/v1/admin/add-user', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUser)) {
      return res.send(403);
    }
    res.send(await geesomeApp.registerUser(req.body));
  });
  service.post('/v1/admin/add-user-api-key', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
      return res.send(403);
    }
    res.send(await geesomeApp.generateUserApiKey(req.body.userId, req.body));
  });
  service.post('/v1/admin/set-user-limit', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetUserLimit)) {
      return res.send(403);
    }
    res.send(await geesomeApp.setUserLimit(req.user.id, req.body));
  });

  service.get('/v1/user/permissions/core/is-have/:permissionName', async (req, res) => {
    res.send({result: await geesomeApp.database.isHaveCorePermission(req.user.id, req.params.permissionName)});
  });

  service.post('/v1/user/export-private-key', async (req, res) => {
    res.send({result: (await geesomeApp.storage.keyLookup(req.user.manifestStaticStorageId)).marshal()});
  });


  service.post('/v1/admin/permissions/core/add_permission', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
      return res.send(403);
    }
    res.send(await geesomeApp.database.addCorePermission(req.body.userId, req.body.permissionName));
  });

  service.post('/v1/admin/permissions/core/remove_permission', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
      return res.send(403);
    }
    res.send(await geesomeApp.database.removeCorePermission(req.body.userId, req.body.permissionName));
  });

  service.get('/v1/admin/all-users', async (req, res) => {
    res.send(await geesomeApp.getAllUserList(req.user.id, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });
  service.get('/v1/admin/all-content', async (req, res) => {
    res.send(await geesomeApp.getAllContentList(req.user.id, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });
  service.get('/v1/admin/all-groups', async (req, res) => {
    res.send(await geesomeApp.getAllGroupList(req.user.id, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });

  service.get('/v1/admin/boot-nodes', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
      return res.send(403);
    }
    res.send(await geesomeApp.storage.getBootNodeList());
  });
  service.post('/v1/admin/boot-nodes/add', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddBootNode)) {
      return res.send(403);
    }
    res.send(await geesomeApp.storage.addBootNode(req.body.address));
  });
  service.post('/v1/admin/boot-nodes/remove', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRemoveBootNode)) {
      return res.send(403);
    }
    res.send(await geesomeApp.storage.removeBootNode(req.body.address));
  });

  service.post('/v1/admin/get-user-account', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
      return res.send(403);
    }
    res.send(await geesomeApp.database.getUserAccountByAddress(req.body.provider, req.body.address));
  });

  service.get('/v1/node-address-list', async (req, res) => {
    res.send({result: await geesomeApp.storage.nodeAddressList()});
  });

  service.get('/v1/user/get-friends', async (req, res) => {
    res.send(await geesomeApp.getUserFriends(req.user.id, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });

  service.post('/v1/user/add-friend', async (req, res) => {
    res.send(await geesomeApp.addUserFriendById(req.user.id, req.body.friendId));
  });

  service.post('/v1/user/remove-friend', async (req, res) => {
    res.send(await geesomeApp.addUserFriendById(req.user.id, req.body.friendId));
  });

  service.get('/v1/admin/get-user/:userId/limit/:limitName', async (req, res) => {
    res.send(await geesomeApp.getUserLimit(req.user.id, req.params.userId, req.params.limitName));
  });

  service.post('/v1/user/update', async (req, res) => {
    res.send(await geesomeApp.updateUser(req.user.id, req.body));
  });

  service.post('/v1/user/set-account', async (req, res) => {
    res.send(await geesomeApp.setUserAccount(req.user.id, req.body));
  });

  service.post('/v1/user/create-group', async (req, res) => {
    res.send(await geesomeApp.createGroup(req.user.id, req.body), 200);
  });
  service.post('/v1/user/group/:groupId/update', async (req, res) => {
    res.send(await geesomeApp.updateGroup(req.user.id, req.params.groupId, req.body), 200);
  });

  service.get('/v1/user/member-in-groups', async (req, res) => {
    res.send(await geesomeApp.getMemberInGroups(req.user.id, req.query.types.split(',')));
  });

  service.get('/v1/user/admin-in-groups', async (req, res) => {
    res.send(await geesomeApp.getAdminInGroups(req.user.id, req.query.types.split(',')));
  });

  service.get('/v1/user/personal-chat-groups', async (req, res) => {
    res.send(await geesomeApp.getPersonalChatGroups(req.user.id));
  });

  service.get('/v1/user/group/:groupId/can-create-post', async (req, res) => {
    res.send({valid: await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)});
  });

  service.get('/v1/user/group/:groupId/can-edit', async (req, res) => {
    res.send({valid: await geesomeApp.canEditGroup(req.user.id, req.params.groupId)});
  });

  service.post('/v1/user/group/:groupId/create-post', async (req, res) => {
    if (!await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)) {
      return res.send(403);
    }
    res.send(await geesomeApp.createPost(req.user.id, req.body), 200);
  });

  service.post('/v1/user/group/:groupId/update-post/:postId', async (req, res) => {
    if (!await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)) {
      return res.send(403);
    }
    res.send(await geesomeApp.updatePost(req.user.id, req.params.postId, req.body), 200);
  });

  service.post('/v1/user/group/:groupId/is-member', async (req, res) => {
    res.send({result: await geesomeApp.isMemberInGroup(req.user.id, req.params.groupId)}, 200);
  });

  service.post('/v1/user/group/:groupId/join', async (req, res) => {
    //TODO: check for private group
    res.send(await geesomeApp.addMemberToGroup(req.user.id, req.params.groupId), 200);
  });

  service.post('/v1/user/group/:groupId/leave', async (req, res) => {
    res.send(await geesomeApp.removeMemberFromGroup(req.user.id, req.params.groupId), 200);
  });

  service.get('/v1/user/api-key-list', async (req, res) => {
    res.send(await geesomeApp.getUserApiKeys(req.user.id, req.query.isDisabled, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])), 200);
  });

  service.post('/v1/user/api-key/add', async (req, res) => {
    res.send(await geesomeApp.generateUserApiKey(req.user.id, req.body));
  });

  service.post('/v1/user/api-key/:apiKeyId/update', async (req, res) => {
    res.send(await geesomeApp.updateApiKey(req.user.id, req.params.apiKeyId, req.body));
  });

  service.post('/v1/user/save-file', async (req, res) => {
    req.pipe(req.busboy);

    const body = {};
    req.busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      body[fieldname] = val;
    });
    req.busboy.on('file', async function (fieldname, file, filename) {
      const options = {
        userId: req.user.id,
        apiKey: req.token,
        ..._.pick(body, ['groupId', 'folderId', 'async'])
      };

      res.send(await geesomeApp.asyncOperationWrapper('saveData', [file, filename, options], options));
    });
  });

  service.post('/v1/user/save-data', async (req, res) => {
    const options = {
      userId: req.user.id,
      apiKey: req.token,
      ..._.pick(req.body, ['groupId', 'folderId', 'mimeType', 'path', 'async'])
    };

    res.send(await geesomeApp.asyncOperationWrapper('saveData', [req.body['content'], req.body['fileName'] || req.body['name'], options], options));
  });

  service.post('/v1/user/save-data-by-url', async (req, res) => {
    const options = {
      userId: req.user.id,
      apiKey: req.token,
      ..._.pick(req.body, ['groupId', 'driver', 'folderId', 'mimeType', 'path', 'async'])
    };

    res.send(await geesomeApp.asyncOperationWrapper('saveDataByUrl', [req.body['url'], options], options));
  });


  service.post('/v1/user/get-async-operation/:id', async (req, res) => {
    res.send(await geesomeApp.getAsyncOperation(req.user.id, req.params.id));
  });

  service.get('/v1/user/file-catalog/', async (req, res) => {
    res.send(await geesomeApp.getFileCatalogItems(req.user.id, req.query.parentItemId, req.query.type, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });
  service.get('/v1/user/file-catalog/file-catalog-item/:itemId/breadcrumbs', async (req, res) => {
    res.send(await geesomeApp.getFileCatalogItemsBreadcrumbs(req.user.id, req.params.itemId));
  });

  service.post('/v1/user/file-catalog/create-folder', async (req, res) => {
    res.send(await geesomeApp.createUserFolder(req.user.id, req.body.parentItemId, req.body.name));
  });
  service.post('/v1/user/file-catalog/add-content-to-folder', async (req, res) => {
    res.send(await geesomeApp.addContentToFolder(req.user.id, req.body.contentId, req.body.folderId));
  });
  service.post('/v1/user/file-catalog/file-catalog-item/:itemId/update', async (req, res) => {
    res.send(await geesomeApp.updateFileCatalogItem(req.user.id, req.params.itemId, req.body));
  });

  service.post('/v1/user/file-catalog/save-content-by-path', async (req, res) => {
    res.send(await geesomeApp.saveContentByPath(req.user.id, req.body.path, req.body.contentId));
  });
  service.post('/v1/user/file-catalog/get-content-by-path', async (req, res) => {
    res.send(await geesomeApp.getContentByPath(req.user.id, req.body.path));
  });
  service.post('/v1/user/file-catalog/get-item-by-path', async (req, res) => {
    res.send(await geesomeApp.getFileCatalogItemByPath(req.user.id, req.body.path, req.body.type));
  });
  service.post('/v1/user/file-catalog/publish-folder/:itemId', async (req, res) => {
    res.send(await geesomeApp.publishFolder(req.user.id, req.params.itemId));
  });

  service.post('/v1/file-catalog/get-contents-ids', async (req, res) => {
    res.send(await geesomeApp.getContentsIdsByFileCatalogIds(req.body));
  });

  service.post('/v1/user/regenerate-previews', async (req, res) => {
    res.send(await geesomeApp.regenerateUserContentPreviews(req.user.id));
  });


  service.get('/v1/group/:groupId', async (req, res) => {
    res.send(await geesomeApp.getGroup(req.params.groupId));
  });

  service.get('/v1/group/:groupId/posts', async (req, res) => {
    res.send(await geesomeApp.getGroupPosts(req.params.groupId, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });

  service.get('/v1/group/:groupId/peers', async (req, res) => {
    res.send(await geesomeApp.getGroupPeers(req.params.groupId));
  });

  service.get('/v1/content/:contentId', async (req, res) => {
    res.send(await geesomeApp.getContent(req.params.contentId));
  });

  service.get('/v1/content-data/*', async (req, res) => {
    const dataPath = req.url.replace('/v1/content-data/', '');
    getFileStream(req, res, dataPath);
  });

  service.get('/ipfs/*', async (req, res) => {
    const ipfsPath = req.url.replace('/ipfs/', '');
    getFileStream(req, res, ipfsPath);
  });

  async function getFileStream (req, res, dataPath) {
    let splitPath = dataPath.split('.');
    if(ipfsHelper.isIpfsHash(splitPath[0])) {
      // cut extension, TODO: use regex
      dataPath = splitPath[0];
    }

    let range = req.headers['range'];
    if(!range) {
      return geesomeApp.getFileStream(dataPath).then((stream) => {
        stream.pipe(res);
      });
    }

    const content = await geesomeApp.getContentByStorageId(dataPath);

    let dataSize = content ? content.size : null;
    if(!dataSize) {
      const stat = await geesomeApp.storage.getFileStat(dataPath);
      dataSize = stat.size;
    }

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

    return geesomeApp.getFileStream(dataPath, fileStreamOptions).then((stream) => {
      //
      let resultLength = 0;
      stream.on('data', (data) => {
        resultLength += data.length;
      });
      stream.on('end', (data) => {
        console.log('contentLength', contentLength);
        console.log('resultLength ', resultLength);
        console.log(range.start + contentLength, '/', dataSize);
        console.log(range.start + resultLength, '/', dataSize);
      });

      res.writeHead(206, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': 0,
        'Content-Type': content ? content.mimeType : '',
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + dataSize,
        'Content-Length': contentLength
      });
      stream.pipe(res);
    });
  }

  service.get('/ipns/*', async (req, res) => {
    const ipnsPath = req.url.replace('/ipns/', '');
    const ipnsId = _.trim(ipnsPath, '/').split('/').slice(0, 1)[0];
    const ipfsId = await geesomeApp.resolveStaticId(ipnsId);

    console.log('ipnsPath', ipnsPath);
    console.log('ipfsPath', ipnsPath.replace(ipnsId, ipfsId));

    geesomeApp.getFileStream(ipnsPath.replace(ipnsId, ipfsId)).then((stream) => {
      stream.pipe(res);
    })
  });

  service.get('/resolve/:storageId', async (req, res) => {
    geesomeApp.resolveStaticId(req.params.storageId).then(res.send.bind(res)).catch((err) => {
      res.send(err.message, 500)
    })
  });

  service.get('/ipld/*', async (req, res) => {
    const ipldPath = req.url.replace('/ipld/', '');
    geesomeApp.getDataStructure(ipldPath).then(result => {
      res.send(_.isNumber(result) ? result.toString() : result);
    }).catch(() => {
      res.send(null, 200)
    });
  });

  service.get('/api/v0/refs*', (req, res) => {
    request('http://localhost:5002/api/v0/refs' + req.url.split('/api/v0/refs')[1]).pipe(res);
  });

  service.post('/save-object', async (req, res) => {
    geesomeApp.storage.saveObject(req.body).then((result) => {
      res.send(result);
    }).catch(() => {
      res.send(null, 500)
    });
  });

  if (geesomeApp.frontendStorageId) {
    service.get('/node*', async (req, res) => {
      if (req.url === '/node') {
        return res.redirect('/node/');
      }
      let path = req.url.replace('/node', '');
      if (!path || path === '/') {
        path = '/index.html';
      }
      res.setHeader('Content-Type', mime.getType(path));
      geesomeApp.getFileStream(geesomeApp.frontendStorageId + path).then((stream) => {
        stream.pipe(res);
      })
    });
  }

  function setHeaders(res) {
    res.setHeader('Strict-Transport-Security', 'max-age=0');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  }

  console.log('🚀 Start api on port', port);

  return service.start(port);
};

function errorHandler (err, req, res) {
  console.log(`Something was wrong: ${err.message || err}`, err)
  res.send(err)
}


