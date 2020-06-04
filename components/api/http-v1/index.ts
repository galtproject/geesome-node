/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../../app/interface";
import {CorePermissionName, UserLimitName} from "../../database/interface";

const ipfsHelper = require('geesome-libs/src/ipfsHelper');
const _ = require('lodash');
const mime = require('mime');
const bodyParser = require('body-parser');
const Busboy = require('busboy');
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

  // service.use(busboy());

  service.get('/v1', async (req, res) => {
    //TODO: output api docs
  });

  /**
   * @apiDefine ApiKey
   *
   * @apiHeader {String} Authorization "Bearer " + Api key from /v1/login/* response
   */

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
      return res.send({user, apiKey: await geesomeApp.generateUserApiKey(user.id, {type:"password_auth"}, true)}, 200);
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
   * @api {post} /v1/generate-auth-message Generate auth message
   * @apiDescription Auth messages is used to sign by account address (Ethereum for example). You have to use private key of account address to sign the message and send result to /v1/login/auth-message.
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
   * @api {post} /v1/login/auth-message Login by account signature
   * @apiDescription You have to sign (by MetaMask for example) "message" from /v1/generate-auth-message and send result inside "signature" field.
   * @apiName LoginAuthMessage
   * @apiGroup Login
   *
   * @apiParam {Number} authMessageId Id from /v1/generate-auth-message response
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

  /**
   * @api {get} /v1/user Get current user
   * @apiName UserCurrent
   * @apiGroup User
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../database/interface.ts) {IUser} apiSuccess
   */
  service.get('/v1/user', async (req, res) => {
    if (!req.user || !req.user.id) {
      return res.send(401);
    }
    res.send(req.user, 200);
  });

  service.get('/v1/user/permissions/core/is-have/:permissionName', async (req, res) => {
    res.send({result: await geesomeApp.database.isHaveCorePermission(req.user.id, req.params.permissionName)});
  });

  service.post('/v1/user/export-private-key', async (req, res) => {
    res.send({result: (await geesomeApp.storage.keyLookup(req.user.manifestStaticStorageId)).marshal()});
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

  service.post('/v1/user/update', async (req, res) => {
    res.send(await geesomeApp.updateUser(req.user.id, req.body));
  });

  service.post('/v1/user/set-account', async (req, res) => {
    res.send(await geesomeApp.setUserAccount(req.user.id, req.body));
  });

  /**
   * @api {post} /v1/user/create-group Create group
   * @apiName UserGroupCreate
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IGroupInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IGroup} apiSuccess
   */
  service.post('/v1/user/create-group', async (req, res) => {
    res.send(await geesomeApp.createGroup(req.user.id, req.body), 200);
  });

  service.post('/v1/category/get', async (req, res) => {
    res.send(await geesomeApp.getCategoryByParams(req.body), 200);
  });

  service.post('/v1/group/get', async (req, res) => {
    res.send(await geesomeApp.getGroupByParams(req.body), 200);
  });

  service.post('/v1/post/get', async (req, res) => {
    res.send(await geesomeApp.getPostByParams(req.body), 200);
  });

  service.post('/v1/user/create-category', async (req, res) => {
    res.send(await geesomeApp.createCategory(req.user.id, req.body), 200);
  });

  service.get('/v1/user/category/:categoryId/groups', async (req, res) => {
    res.send(await geesomeApp.getCategoryGroups(req.user.id, req.params.categoryId, req.query, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])), 200);
  });

  service.post('/v1/user/category/:categoryId/add-group', async (req, res) => {
    res.send(await geesomeApp.addGroupToCategory(req.user.id, req.body.groupId, req.params.categoryId), 200);
  });

  service.post('/v1/user/category/:categoryId/add-member', async (req, res) => {
    res.send(await geesomeApp.addMemberToCategory(req.user.id, req.params.categoryId, req.body.userId, req.body.permissions || []), 200);
  });

  service.post('/v1/user/category/:categoryId/remove-member', async (req, res) => {
    res.send(await geesomeApp.removeMemberFromCategory(req.user.id, req.params.categoryId, req.body.userId), 200);
  });

  service.post('/v1/user/category/:categoryId/is-member', async (req, res) => {
    res.send({result: await geesomeApp.isMemberInCategory(req.user.id, req.params.categoryId)}, 200);
  });

  /**
   * @api {post} /v1/user/group/:groupId/update Edit group
   * @apiDescription Can be edit by database id or storage id
   * @apiName UserGroupUpdate
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IGroupInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IGroup} apiSuccess
   */
  service.post('/v1/user/group/:groupId/update', async (req, res) => {
    res.send(await geesomeApp.updateGroup(req.user.id, req.params.groupId, req.body), 200);
  });

  /**
   * @api {get} /v1/user/member-in-groups Get groups where user is member
   * @apiName UserGroupsForMember
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
   */
  service.get('/v1/user/member-in-groups', async (req, res) => {
    res.send(await geesomeApp.getMemberInGroups(req.user.id, req.query.types.split(',')));
  });

  /**
   * @api {get} /v1/user/admin-in-groups Get groups where user is admin
   * @apiName UserGroupsForAdmin
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
   */
  service.get('/v1/user/admin-in-groups', async (req, res) => {
    res.send(await geesomeApp.getAdminInGroups(req.user.id, req.query.types.split(',')));
  });

  /**
   * @api {get} /v1/user/personal-chat-groups Get personal chat groups
   * @apiName UserGroupsAsPersonalChats
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IGroupListResponse} apiSuccess
   */
  service.get('/v1/user/personal-chat-groups', async (req, res) => {
    res.send(await geesomeApp.getPersonalChatGroups(req.user.id));
  });

  service.get('/v1/user/group/:groupId/can-create-post', async (req, res) => {
    res.send({valid: await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)});
  });

  service.get('/v1/user/group/:groupId/can-edit', async (req, res) => {
    res.send({valid: await geesomeApp.canEditGroup(req.user.id, req.params.groupId)});
  });

  /**
   * @api {post} /v1/user/group/:groupId/create-post Create Group post
   * @apiDescription Create post by content ids and group id.
   * @apiName UserGroupCreatePost
   * @apiGroup UserGroup
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IPostInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IPost} apiSuccess
   */
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
    res.send(await geesomeApp.addMemberToGroup(req.user.id, req.params.groupId, req.user.id), 200);
  });

  service.post('/v1/user/group/:groupId/leave', async (req, res) => {
    res.send(await geesomeApp.removeMemberFromGroup(req.user.id, req.params.groupId, req.user.id), 200);
  });

  service.post('/v1/user/group/:groupId/add-admin', async (req, res) => {
    res.send(await geesomeApp.addAdminToGroup(req.user.id, req.params.groupId, req.body.userId), 200);
  });

  service.post('/v1/user/group/:groupId/remove-admin', async (req, res) => {
    res.send(await geesomeApp.removeAdminFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
  });

  service.post('/v1/user/group/:groupId/set-admins', async (req, res) => {
    res.send(await geesomeApp.setAdminsOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
  });

  service.post('/v1/user/group/:groupId/add-member', async (req, res) => {
    res.send(await geesomeApp.addMemberToGroup(req.user.id, req.params.groupId, req.body.userId, req.body.permissions || []), 200);
  });

  service.post('/v1/user/group/:groupId/set-members', async (req, res) => {
    res.send(await geesomeApp.setMembersOfGroup(req.user.id, req.params.groupId, req.body.userIds), 200);
  });

  service.post('/v1/user/group/:groupId/set-permissions', async (req, res) => {
    res.send(await geesomeApp.setGroupPermissions(req.user.id, req.params.groupId, req.body.userId, req.body.permissions), 200);
  });

  service.post('/v1/user/group/:groupId/remove-member', async (req, res) => {
    res.send(await geesomeApp.removeMemberFromGroup(req.user.id, req.params.groupId, req.body.userId), 200);
  });

  service.post('/v1/user/group-section/create', async (req, res) => {
    res.send(await geesomeApp.createGroupSection(req.user.id, req.body), 200);
  });

  service.post('/v1/user/group-section/:groupSectionId/update', async (req, res) => {
    res.send(await geesomeApp.updateGroupSection(req.user.id, req.params.groupSectionId, req.body), 200);
  });

  service.get('/v1/user/group-sections', async (req, res) => {
    res.send(await geesomeApp.getGroupSectionItems(req.query, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])), 200);
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

  /**
   * @api {post} /v1/user/save-file Save file
   * @apiDescription Store file from browser by FormData class in "file" field. Other fields can be stored as key value.
   * @apiName UserSaveFile
   * @apiGroup UserContent
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IFileContentInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IContent} apiSuccess
   */
  service.post('/v1/user/save-file', async (req, res) => {
    const busboy = new Busboy({
      headers: req.headers,
      limits: {
        fileSize: await geesomeApp.getUserLimitRemained(req.user.id, UserLimitName.SaveContentSize)
      }
    });

    const body = {};
    busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
      body[fieldname] = val;
    });
    busboy.on('file', async function (fieldname, file, filename) {
      const options = {
        userId: req.user.id,
        apiKey: req.token,
        ..._.pick(body, ['driver', 'groupId', 'folderId', 'path', 'async'])
      };

      const asyncOperationRes = await geesomeApp.asyncOperationWrapper('saveData', [file, filename, options], options);
      res.send(asyncOperationRes);
    });

    req.pipe(busboy);
  });

  /**
   * @api {post} /v1/user/save-data Save data
   * @apiDescription Store data (string or buffer)
   * @apiName UserSaveData
   * @apiGroup UserContent
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IDataContentInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IContent} apiSuccess
   */
  service.post('/v1/user/save-data', async (req, res) => {
    const options = {
      userId: req.user.id,
      apiKey: req.token,
      ..._.pick(req.body, ['groupId', 'folderId', 'mimeType', 'path', 'async', 'driver'])
    };

    res.send(await geesomeApp.asyncOperationWrapper('saveData', [req.body['content'], req.body['fileName'] || req.body['name'], options], options));
  });

  /**
   * @api {post} /v1/user/save-data-by-url Save data by url
   * @apiDescription Download and store data by url
   * @apiName UserSaveDataByUrl
   * @apiGroup UserContent
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../app/interface.ts) {IUrlContentInput} apiParam
   *
   * @apiInterface (../../database/interface.ts) {IContent} apiSuccess
   */
  service.post('/v1/user/save-data-by-url', async (req, res) => {
    const options = {
      userId: req.user.id,
      apiKey: req.token,
      ..._.pick(req.body, ['groupId', 'driver', 'folderId', 'mimeType', 'path', 'async'])
    };

    res.send(await geesomeApp.asyncOperationWrapper('saveDataByUrl', [req.body['url'], options], options));
  });

  /**
   * @api {post} /v1/user/get-async-operation/:id Get async operation
   * @apiDescription Get async operation info: operation type, status, percent, and content when it will be ready.
   * @apiName UserAsyncOperation
   * @apiGroup UserOther
   *
   * @apiUse ApiKey
   *
   * @apiInterface (../../database/interface.ts) {IUserAsyncOperation} apiSuccess
   */
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
  service.post('/v1/user/file-catalog/file-catalog-item/:itemId/delete', async (req, res) => {
    res.send({result: await geesomeApp.deleteFileCatalogItem(req.user.id, req.params.itemId, req.body)});
  });

  service.post('/v1/user/file-catalog/save-manifests-to-folder', async (req, res) => {
    res.send(await geesomeApp.saveManifestsToFolder(req.user.id, req.body.path, req.body.toSaveList, req.body.options));
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
    res.send(await geesomeApp.publishFolder(req.user.id, req.params.itemId, req.body));
  });

  service.post('/v1/file-catalog/get-contents-ids', async (req, res) => {
    res.send(await geesomeApp.getContentsIdsByFileCatalogIds(req.body));
  });

  //TODO: add limit for this action

  // service.post('/v1/user/regenerate-previews', async (req, res) => {
  //   res.send(await geesomeApp.regenerateUserContentPreviews(req.user.id));
  // });


  service.get('/v1/group/:groupId', async (req, res) => {
    res.send(await geesomeApp.getGroup(req.params.groupId));
  });

  /**
   * @api {get} /v1/group/:groupId/posts Get group posts
   * @apiName GroupPosts
   * @apiGroup Group
   *
   * @apiUse ApiKey
   *
   * @apiParam sortBy
   * @apiParam sortDir
   * @apiParam limit
   * @apiParam offset
   *
   * @apiInterface (../../app/interface.ts) {IPostListResponse} apiSuccess
   */
  service.get('/v1/group/:groupId/posts', async (req, res) => {
    res.send(await geesomeApp.getGroupPosts(req.params.groupId, req.query, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });

  service.get('/v1/group/:groupId/peers', async (req, res) => {
    res.send(await geesomeApp.getGroupPeers(req.params.groupId));
  });

  service.get('/v1/category/:categoryId/posts', async (req, res) => {
    res.send(await geesomeApp.getCategoryPosts(req.params.categoryId, req.query, _.pick(req.query, ['sortBy', 'sortDir', 'limit', 'offset'])));
  });

  //TODO: move permissions checks to geesomeApp class
  service.post('/v1/admin/add-user', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUser)) {
      return res.send(403);
    }
    if (req.body.permissions && !await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
      return res.send(403);
    }
    res.send(await geesomeApp.registerUser(req.body));
  });
  service.post('/v1/admin/add-user-api-key', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminAddUserApiKey)) {
      return res.send(403);
    }
    res.send(await geesomeApp.generateUserApiKey(req.body.userId, req.body, true));
  });
  service.get('/v1/admin/get-user-by-api-key/:apiKey', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
      return res.send(403);
    }
    res.send(await geesomeApp.getUserByApiKey(req.params.apiKey));
  });
  service.post('/v1/admin/set-user-limit', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetUserLimit)) {
      return res.send(403);
    }
    res.send(await geesomeApp.setUserLimit(req.user.id, req.body));
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

  service.post('/v1/admin/permissions/core/get_list', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminSetPermissions)) {
      return res.send(403);
    }
    res.send(await geesomeApp.database.getCorePermissions(req.body.userId));
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

  service.get('/v1/admin/get-user/:userId/limit/:limitName', async (req, res) => {
    if (!await geesomeApp.database.isHaveCorePermission(req.user.id, CorePermissionName.AdminRead)) {
      return res.send(403);
    }
    const limit: any = JSON.parse(JSON.stringify(await geesomeApp.getUserLimit(req.user.id, req.params.userId, req.params.limitName)));
    limit.remained = await geesomeApp.getUserLimitRemained(req.params.userId, req.params.limitName);
    res.send(limit);
  });

  service.get('/v1/content/:contentId', async (req, res) => {
    res.send(await geesomeApp.getContent(req.params.contentId));
  });

  service.get('/v1/content-by-storage-id/:contentStorageId', async (req, res) => {
    res.send(await geesomeApp.getContentByStorageId(req.params.contentStorageId));
  });

  service.get('/v1/content-data/*', async (req, res) => {
    const dataPath = req.url.replace('/v1/content-data/', '');
    getFileStream(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
  });

  service.get('/ipfs/*', async (req, res) => {
    const ipfsPath = req.url.replace('/ipfs/', '');
    getFileStream(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
  });

  service.head('/v1/content-data/*', async (req, res) => {
    const dataPath = req.url.replace('/v1/content-data/', '');
    getContentHead(req, res, dataPath).catch((e) => {console.error(e); res.send(400)});
  });

  service.head('/ipfs/*', async (req, res) => {
    const ipfsPath = req.url.replace('/ipfs/', '');
    getContentHead(req, res, ipfsPath).catch((e) => {console.error(e); res.send(400)});
  });

  async function getContentHead(req, res, hash) {
    setHeaders(res);
    const content = await geesomeApp.database.getContentByStorageId(hash, true);
    if(content) {
      res.setHeader('Content-Type', content.storageId === hash ? content.mimeType : content.previewMimeType);
    }
    res.send(200);
  }

  async function getFileStream (req, res, dataPath) {
    setStorageHeaders(res);

    let splitPath = dataPath.split('.');
    console.log('isIpfsHash', splitPath[0]);
    if(ipfsHelper.isIpfsHash(splitPath[0])) {
      // cut extension, TODO: use regex
      dataPath = splitPath[0];
    }

    let range = req.headers['range'];
    if(!range) {
      const content = await geesomeApp.database.getContentByStorageId(dataPath, true);
      if(content) {
        res.setHeader('Content-Type', content.storageId === dataPath ? content.mimeType : content.previewMimeType);
      }
      return geesomeApp.getFileStream(dataPath).then((stream) => {
        stream.pipe(res);
      });
    }

    const content = await geesomeApp.getContentByStorageId(dataPath);

    // let dataSize = content ? content.size : null;
    // if(!dataSize) {
    //TODO: use content.size when all video sizes will be right in database
      const stat = await geesomeApp.storage.getFileStat(dataPath);
      let dataSize = stat.size;
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

    return geesomeApp.getFileStream(dataPath, fileStreamOptions).then((stream) => {
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
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes ' + range.start + '-' + range.end + '/' + dataSize,
        'Content-Length': contentLength
      });
      stream.pipe(res);
    });
  }

  service.get('/ipns/*', async (req, res) => {
    // console.log('ipns req.url', req.url);
    const ipnsPath = req.url.replace('/ipns/', '').split('?')[0];
    const ipnsId = _.trim(ipnsPath, '/').split('/').slice(0, 1)[0];
    const ipfsId = await geesomeApp.resolveStaticId(ipnsId);

    // console.log('ipnsPath', ipnsPath);
    // console.log('ipfsPath', ipnsPath.replace(ipnsId, ipfsId));

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
    setStorageHeaders(res);
    const ipldPath = req.url.replace('/ipld/', '');
    geesomeApp.getDataStructure(ipldPath).then(result => {
      res.send(_.isNumber(result) ? result.toString() : result);
    }).catch(() => {
      res.send(null, 200)
    });
  });

  service.get('/v1/node-address-list', async (req, res) => {
    res.send({result: await geesomeApp.storage.nodeAddressList()});
  });

  service.get('/api/v0/refs*', (req, res) => {
    setStorageHeaders(res);
    request('http://localhost:5002/api/v0/refs' + req.url.split('/api/v0/refs')[1]).pipe(res);
  });

  service.post('/save-object', async (req, res) => {
    geesomeApp.saveDataStructure(req.body).then((result) => {
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

  service.options("/*", function (req, res, next) {
    setHeaders(res);
    res.send(200);
  });
  service.head("/*", function (req, res, next) {
    setHeaders(res);
    res.send(200);
  });

  function setHeaders(res) {
    res.setHeader('Strict-Transport-Security', 'max-age=0');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  }

  function setStorageHeaders(res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, stale-if-error=0');
  }

  console.log('🚀 Start api on port', port);

  await service.start(port);

  return service;
};

function errorHandler (err, req, res) {
  console.log(`Something was wrong: ${err.message || err}`, err)
  res.send(err)
}


