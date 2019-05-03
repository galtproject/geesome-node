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

const config = require('./config');

const busboy = require('connect-busboy');

const service = require('restana')({
    ignoreTrailingSlash: true,
    maxParamLength: 2000
});
const bodyParser = require('body-parser');
const _ = require('lodash');

module.exports = (geesomeApp: IGeesomeApp, port) => {
    require('./showEndpointsTable');
    service.use(bodyParser.json());
    
    service.use(async (req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS");
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');

        req.query = {};
        if(_.includes(req.url, '?')) {
            const searchParams: any = new URLSearchParams(req.url.split('?')[1]);
            const keys = searchParams.keys();
            for (let key = keys.next(); key.done !== true; key = keys.next()) {
                req.query[key.value] = searchParams.get(key.value);
            }
        }
        
        //TODO: fetch user id
        req.userId = 1;
        
        return next();
    });

    service.use(busboy());

    service.options("/*", function(req, res, next){
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', "GET, POST, PATCH, PUT, DELETE, OPTIONS");
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
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

    service.post('/v1/save-post', async (req, res) => {
        res.send(await geesomeApp.savePost(req.userId, res.body), 200);
    });

    service.post('/v1/save-file', async (req, res) => {
        req.pipe(req.busboy);
        req.busboy.on('file', async function (fieldname, file, filename) {
            console.log("Uploading: " + filename);

            res.send(await geesomeApp.saveFile(file), 200);
        });
    });

    service.get('/v1/download-ipfs/:ipfsHash', async (req, res) => {
        // console.log('res', res);
        const filestream = geesomeApp.getFileStream(req.params.ipfsHash);
        // console.log('filestream', filestream);
        filestream.on('data', (file) => {
            // write the file's path and contents to standard out
            console.log(file.path);
            console.log('file', file);
            if(file.type !== 'dir') {
                file.content.pipe(res);
                // .on('data', (data) => {
                //     console.log('data', data.toString());
                // });
                // file.content.resume()
            }
        })
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


