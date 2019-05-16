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
import * as path from "path";

const config = require('./config');

const busboy = require('connect-busboy');
const serveStatic = require('serve-static');

const service = require('restana')({
    ignoreTrailingSlash: true,
    maxParamLength: 2000
});
const bodyParser = require('body-parser');
const _ = require('lodash');

module.exports = async (geesomeApp: IGeesomeApp, port) => {
    require('./showEndpointsTable');
    service.use(bodyParser.json());
    service.use(bodyParser.urlencoded({ extended: true }));

    service.use(require('morgan')('combined'));
    service.use(require('cookie-parser')());
    service.use(require('express-session')({
        key: 'session_cookie',
        secret: await geesomeApp.getSecretKey('session'),
        store: geesomeApp.database.getSessionStore(),
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false
        }
    }));

    service.use(geesomeApp.authorization.initialize());
    service.use(geesomeApp.authorization.session());

    service.use(serveStatic(path.join(__dirname, 'frontend/dist')));
    
    function setHeaders(res) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD");
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
    }
    service.use((req, res, next) => {
        setHeaders(res);

        req.query = {};
        if(_.includes(req.url, '?')) {
            const searchParams: any = new URLSearchParams(req.url.split('?')[1]);
            const keys = searchParams.keys();
            for (let key = keys.next(); key.done !== true; key = keys.next()) {
                req.query[key.value] = searchParams.get(key.value);
            }
        }

        req.session.reload(function(err) {
            console.log('req.session.userId', req.session.userId);

            //TODO: fetch user id
            // req.user = {id: 1};

            return next();
        });
    });

    service.use(busboy());

    service.options("/*", function(req, res, next){
        setHeaders(res);
        res.send(200);
    });
    service.head("/*", function(req, res, next){ 
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

    service.get('/v1/current-user', async (req, res) => {
        if(!req.user || !req.user.id) {
            return res.send(401);
        }
        res.send(req.user, 200);
    });

    service.post('/v1/login', geesomeApp.authorization.handleAuth(), async (req, res) => {
        res.send(req.user, 200);
    });

    service.get('/v1/user/member-in-groups', async (req, res) => {
        res.send(await geesomeApp.getMemberInGroups(req.user.id));
    });

    service.get('/v1/user/admin-in-groups', async (req, res) => {
        res.send(await geesomeApp.getAdminInGroups(req.user.id));
    });
    
    service.get('/v1/user/group/:groupId/can-create-post', async (req, res) => {
        res.send({ valid: await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)});
    });
    
    service.post('/v1/user/group/:groupId/create-post', async (req, res) => {
        if(!await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)) {
            return res.send(403);
        }
        res.send(await geesomeApp.createPost(req.userId, req.body), 200);
    });

    service.post('/v1/user/group/:groupId/update-post/:postId', async (req, res) => {
        if(!await geesomeApp.canCreatePostInGroup(req.user.id, req.params.groupId)) {
            return res.send(403);
        }
        res.send(await geesomeApp.updatePost(req.userId, req.params.postId, req.body), 200);
    });

    service.post('/v1/user/save-file', async (req, res) => {
        req.pipe(req.busboy);

        const body = {};
        req.busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
            body[fieldname] = val;
        });
        req.busboy.on('file', async function (fieldname, file, filename) {
            res.send(await geesomeApp.saveData(file, filename, {userId: req.user.id, groupId: body['groupId']}), 200);
        });
    });

    service.post('/v1/user/save-data', async (req, res) => {
        res.send(await geesomeApp.saveData(req.body['content'], 'index.html', {userId: req.user.id, groupId: req.body['groupId']}), 200);
    });

    service.post('/v1/user/save-data-by-url', async (req, res) => {
        res.send(await geesomeApp.saveDataByUrl(req.body['url'], {userId: req.user.id, groupId: req.body['groupId'], driver: req.body['driver']}), 200);
    });


    service.get('/v1/group/:groupId', async (req, res) => {
        res.send(await geesomeApp.getGroup(req.params.groupId));
    });
    
    service.get('/v1/group/:groupId/posts', async (req, res) => {
        res.send(await geesomeApp.getGroupPosts(req.params.groupId, req.query.sortDir, req.query.limit, req.query.offest));
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
        geesomeApp.getFileStream(req.params.storageId).then((stream) => {
            stream.pipe(res);
        })
    });

    service.get('/resolve/:storageId', async (req, res) => {
        geesomeApp.storage.resolveStaticId(req.params.storageId).then(res.send.bind(res))
    });

    service.get('/ipld/*', async (req, res) => {
        const ipldPath = req.url.replace('/ipld/', '');
        console.log('ipldPath', ipldPath);
        geesomeApp.getDataStructure(ipldPath).then(result => {
            res.send(_.isNumber(result) ? result.toString() : result);
        }).catch(() => {res.send(null, 200)});
    });
    
    function handleError(res, e) {
        return res.send({
            error: e.message || e,
            errorCode: -1
        }, 400);
    }
    
    console.log('🚀 Start api on port', port);
    
    return service.start(port);
};


