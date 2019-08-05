/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

import {IGeesomeApp} from "../../app/interface";
import {CorePermissionName} from "../../database/interface";

const config = require('./config');

const _ = require('lodash');
const mime = require('mime');
const pIteration = require('p-iteration');

const bodyParser = require('body-parser');
const busboy = require('connect-busboy');
const bearerToken = require('express-bearer-token');
const proxy = require('express-http-proxy');

const service = require('restana')({
  ignoreTrailingSlash: true,
  maxParamLength: 2000
});

const maxBodySizeMb = 2000;

module.exports = async (geesomeApp: IGeesomeApp, port) => {
  require('./showEndpointsTable');
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
    const endpoints = config.endpointsInfo;

    const html = "<html>"
      + endpoints
        .map(e => `<h3>${e.uri}</h3>Method: <b>GET</b><br>Header: <b>${e.header}</b><br>Body: <b>${e.body}</b><br>Response: <b>${e.response}</b>`)
        .join('<br><br>')
      + "</html>";
    res.send(html, 200);
  });

  service.get('/v1/is-empty', async (req, res) => {
    res.send({
      result: (await geesomeApp.database.getUsersCount()) === 0
    }, 200);
  });

  service.post('/v1/setup', async (req, res) => {
    if ((await geesomeApp.database.getUsersCount()) > 0) {
      return res.send(403);
    }
    const adminUser = await geesomeApp.registerUser(req.body.email, req.body.name, req.body.password);

    await pIteration.forEach(['AdminRead', 'AdminAddUser', 'AdminSetUserLimit', 'AdminAddUserApiKey', 'AdminSetPermissions', 'AdminAddBootNode', 'AdminRemoveBootNode'], (permissionName) => {
      return geesomeApp.database.addCorePermission(adminUser.id, CorePermissionName[permissionName])
    });

    res.send({user: adminUser, apiKey: await geesomeApp.generateUserApiKey(adminUser.id, "password_auth")}, 200);
  });

  service.post('/v1/login', async (req, res) => {
    geesomeApp.loginUser(req.body.username, req.body.password).then(async user => {
      if (user) {
        return res.send({user, apiKey: await geesomeApp.generateUserApiKey(user.id, "password_auth")}, 200);
      } else {
        return res.send(403);
      }
    }).catch((err) => {
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
    res.send(await geesomeApp.registerUser(req.body.email, req.body.name, req.body.password));
  });
  service.post('/v1/admin/add-user-api-key', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
      return res.send(403);
    }
    res.send(await geesomeApp.generateUserApiKey(req.body.userId, 'admin_manual'));
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
  service.get('/v1/node-address-list', async (req, res) => {
    res.send({result: await geesomeApp.storage.nodeAddressList()});
  });

  service.get('/v1/admin/get-user/:userId/limit/:limitName', async (req, res) => {
    res.send(await geesomeApp.getUserLimit(req.user.id, req.params.userId, req.params.limitName));
  });

  service.post('/v1/user/update', async (req, res) => {
    res.send(await geesomeApp.updateUser(req.user.id, req.body));
  });

  service.post('/v1/user/create-group', async (req, res) => {
    res.send(await geesomeApp.createGroup(req.user.id, req.body), 200);
  });
  service.post('/v1/user/group/:groupId/update', async (req, res) => {
    res.send(await geesomeApp.updateGroup(req.user.id, req.params.groupId, req.body), 200);
  });

  service.get('/v1/user/member-in-groups', async (req, res) => {
    res.send(await geesomeApp.getMemberInGroups(req.user.id));
  });

  service.get('/v1/user/admin-in-groups', async (req, res) => {
    res.send(await geesomeApp.getAdminInGroups(req.user.id));
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

  service.get('/v1/user/api-keys', async (req, res) => {
    res.send(await geesomeApp.getUserApiKeys(req.user.id, req.query.isDisabled, req.query.search, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])), 200);
  });

  service.post('/v1/user/save-file', async (req, res) => {
    req.pipe(req.busboy);

    const body = {};
    req.busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      body[fieldname] = val;
    });
    req.busboy.on('file', async function (fieldname, file, filename) {
      res.send(await geesomeApp.saveData(file, filename, {
        userId: req.user.id,
        apiKey: req.token,
        groupId: body['groupId'],
        folderId: body['folderId']
      }), 200);
    });
  });

  service.post('/v1/user/save-data', async (req, res) => {
    res.send(await geesomeApp.saveData(req.body['content'], req.body['fileName'] || req.body['name'], {
      userId: req.user.id,
      apiKey: req.token,
      groupId: req.body['groupId'],
      folderId: req.body['folderId']
    }), 200);
  });

  service.post('/v1/user/save-data-by-url', async (req, res) => {
    res.send(await geesomeApp.saveDataByUrl(req.body['url'], {
      userId: req.user.id,
      apiKey: req.token,
      groupId: req.body['groupId'],
      driver: req.body['driver'],
      folderId: req.body['folderId']
    }), 200);
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

  service.post('/v1/file-catalog/get-contents-ids', async (req, res) => {
    res.send(await geesomeApp.getContentsIdsByFileCatalogIds(req.body));
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

  service.get('/v1/content-data/:storageId', async (req, res) => {
    geesomeApp.getFileStream(req.params.storageId).then((stream) => {
      stream.pipe(res);
    })
  });

  service.get('/ipfs/:storageId', async (req, res) => {
    //TODO: https://gist.github.com/padenot/1324734
    geesomeApp.getFileStream(req.params.storageId).then((stream) => {
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
    console.log('ipldPath', ipldPath);
    geesomeApp.getDataStructure(ipldPath).then(result => {
      res.send(_.isNumber(result) ? result.toString() : result);
    }).catch(() => {
      res.send(null, 200)
    });
  });

  service.get('/v0/refs*', proxy('localhost'));

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

  function handleError(res, e) {
    return res.send({
      error: e.message || e,
      errorCode: -1
    }, 400);
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


