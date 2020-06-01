/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp} from "../components/app/interface";
import {
  ContentView,
  CorePermissionName,
  FileCatalogItemType, GroupPermissionName,
  PostStatus,
  UserLimitName
} from "../components/database/interface";

const ipfsHelper = require("geesome-libs/src/ipfsHelper");
const assert = require('assert');
const fs = require('fs');
const _ = require('lodash');
const log = require('../components/log');

describe("app", function () {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}}};

  this.timeout(60000);

  let app: IGeesomeApp;

  const versions = ['v1'];//'ipfs-http-client'

  versions.forEach((appVersion) => {
    describe('app ' + appVersion, () => {
      beforeEach(async () => {
        const appConfig = require('../components/app/v1/config');
        appConfig.storageConfig.jsNode.repo = '.jsipfs-test';
        appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';
        appConfig.storageConfig.jsNode.config = {
          Addresses: {
            Swarm: [
              "/ip4/0.0.0.0/tcp/40002",
              "/ip4/127.0.0.1/tcp/40003/ws",
              "/dns4/wrtc-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star"
            ]
          }
        };
        
        try {
          app = await require('../components/app/' + appVersion)({databaseConfig, storageConfig: appConfig.storageConfig, port: 7771});

          await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
          const testUser = await app.registerUser({email: 'user@user.com', name: 'user', password: 'user', permissions: [CorePermissionName.UserAll]});
          await app.createGroup(testUser.id, {
            name: 'test',
            title: 'Test'
          });
        } catch (e) {
          console.error(e);
          assert.equal(true, false);
        }
      });
      
      afterEach(async () => {
        await app.database.flushDatabase();
        await app.stop();
      });

      it("should initialized successfully", async () => {
        assert.equal(await app.database.getUsersCount(), 2);

        await new Promise((resolve, reject) => {
          fs.writeFile('/tmp/test', 'test', resolve);
        });
        const resultFile = await app.storage.saveFileByPath('/tmp/test');

        assert.notEqual(resultFile.id, undefined);

        const adminUser = (await app.database.getAllUserList('admin'))[0];
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const limitData = {
          name: UserLimitName.SaveContentSize,
          value: 100 * (10 ** 3),
          adminId: adminUser.id,
          userId: testUser.id,
          periodTimestamp: 60,
          isActive: true
        };
        await app.setUserLimit(adminUser.id, limitData);

        try {
          await app.saveData(fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
            userId: testUser.id,
            groupId: testGroup.id
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(true, true);
        }

        limitData.value = 1000 * (10 ** 3);

        await app.setUserLimit(adminUser.id, limitData);

        await app.saveData(fs.createReadStream(`${__dirname}/../exampleContent/post3.jpg`), 'post3.jpg', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const contentObj = await app.saveData({type: "Buffer", data: [49]}, '1.txt', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const mainfestData = await app.getDataStructure(contentObj.manifestStorageId);
        const savedManifestStorageId = await app.saveDataStructure(mainfestData);

        assert.equal(contentObj.manifestStorageId, savedManifestStorageId);
        
        // const contentObj = await app.saveDataByUrl('https://www.youtube.com/watch?v=rxGnonKB7TY', {userId: 1, groupId: 1, driver: 'youtube-video'});
        // console.log('contentObj', contentObj);
        //
        // assert.notEqual(contentObj.storageAccountId, null);
      });
      
      it('should correctly save data with only save permission', async () => {
        const saveDataTestUser = await app.registerUser({email: 'user-save-data@user.com', name: 'user-save-data', permissions: [CorePermissionName.UserSaveData]});

        log('saveDataTestUser');
        const textContent = await app.saveData('test', 'text.txt', {userId: saveDataTestUser.id});
        log('textContent');

        const contentObj = await app.storage.getObject(textContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'text/plain');

        await app.saveData('test', 'text.txt', {userId: saveDataTestUser.id});
        log('saveData');

        const ipld = await app.storage.saveObject(contentObj);
        assert.equal(ipld, textContent.manifestStorageId);
      });

      it('should correctly save data structures', async () => {
        const testObject = {foo: 'bar'};
        const ipld1 = await app.storage.saveObject(testObject);
        const ipld2 = await app.saveDataStructure(testObject);
        assert.equal(ipld1, ipld2);

        const object1 = await app.storage.getObject(ipld1);
        const object2 = await app.getDataStructure(ipld2);
        assert.deepEqual(object1, object2);

        const newTestObject = {foo: 'bar', foo2: 'bar2'};
        const newTesObjectId = await app.storage.saveObject(newTestObject);
        let newTestObjectDbContent = await app.database.getObjectByStorageId(newTesObjectId);
        assert.equal(newTestObjectDbContent, null);

        await app.getDataStructure(newTesObjectId);
        await new Promise((resolve) => {setTimeout(resolve, 200)});
        newTestObjectDbContent = await app.database.getObjectByStorageId(newTesObjectId);
        assert.deepEqual(JSON.parse(newTestObjectDbContent.data), newTestObject);
      });

      it('should correctly save image', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const imageContent = await app.saveData(fs.createReadStream(__dirname + '/resources/input-image.png'), 'input-image.png', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const contentObj = await app.storage.getObject(imageContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'image/png');

        console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType);
        assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
        assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
      });

      it('should correctly save video', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const videoContent = await app.saveData(fs.createReadStream(__dirname + '/resources/input-video.mp4'), 'input-video.mp4', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const contentObj = await app.storage.getObject(videoContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'video/mp4');

        console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType)
        assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
        assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
      });

      it('should correctly save mov video', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const videoContent = await app.saveData(fs.createReadStream(__dirname + '/resources/input-video.mov'), 'input-video.mov', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const contentObj = await app.storage.getObject(videoContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'video/mp4');

        console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType)
        assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
        assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
      });

      it("should upload archive and unzip correctly", async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];

        const archivePath = __dirname + '/resources/test-archive.zip';
        const archiveContent = await app.saveData(fs.createReadStream(archivePath), 'archive.zip', {userId: testUser.id, driver: 'archive'});

        const contentObj = await app.storage.getObject(archiveContent.manifestStorageId);
        assert.equal(contentObj.mimeType, 'directory');
        assert.equal(contentObj.extension, 'none');
        assert.equal(contentObj.size > 0, true);

        let gotIndexHtmlByFolder = await app.storage.getFileData(archiveContent.storageId + '/test.txt');
        assert.equal(gotIndexHtmlByFolder, 'Test\n');
      });

      it("should create directory by files manifests correctly", async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];

        const indexHtml = '<h1>Hello world</h1>';
        const fileName = 'index.html';
        const foldersPath = '/1/2/3/';

        const indexHtmlContent = await app.saveData(indexHtml, fileName, {userId: testUser.id});

        const resultFolder = await app.saveManifestsToFolder(testUser.id, foldersPath, [{
          manifestStorageId: indexHtmlContent.manifestStorageId
        }]);
        let publishFolderResult = await app.publishFolder(testUser.id, resultFolder.id,);

        let gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/' + fileName);
        assert.equal(gotIndexHtmlByFolder, indexHtml);
      });

      it("should file catalog working properly", async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        
        const indexHtml = '<h1>Hello world</h1>';
        const fileName = 'index.html';
        const foldersPath = '/1/2/3/';
        const filePath = foldersPath + fileName;
        
        const indexHtmlContent = await app.saveData(indexHtml, fileName, {userId: testUser.id});

        const indexHtmlFileItem = await app.saveContentByPath(testUser.id, filePath, indexHtmlContent.id);
        assert.equal(indexHtmlFileItem.name, fileName);
        
        let parentFolderId = indexHtmlFileItem.parentItemId;
        let level = 3;
        
        while(parentFolderId) {
          const parentFolder = await app.database.getFileCatalogItem(parentFolderId);
          assert.equal(parentFolder.name, level.toString());
          level -= 1;
          parentFolderId = parentFolder.parentItemId;
        }
        
        const foundIndexHtmlFileContent = await app.getContentByPath(testUser.id, filePath);

        assert.equal(foundIndexHtmlFileContent.id, indexHtmlFileItem.content.id);
        
        const gotIndexHtml = await app.storage.getFileData(indexHtmlFileItem.content.storageId);
        
        assert.equal(gotIndexHtml, indexHtml);

        console.log('publishFolder indexHtmlFileItem.parentItem');
        let publishFolderResult = await app.publishFolder(testUser.id, indexHtmlFileItem.parentItemId, {bindToStatic: true});
        
        const resolvedStorageId = await app.resolveStaticId(publishFolderResult.staticId);
        
        assert.equal(publishFolderResult.storageId, resolvedStorageId);
        
        let gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/' + fileName);

        assert.equal(gotIndexHtmlByFolder, indexHtml);
        
        try {
          await app.storage.getFileData(publishFolderResult.storageId + '/incorrect' + fileName);
          assert.equal(true, false);
        } catch (e) {
          assert.equal(e.message, 'file does not exist');
        }
        
        const firstFolder = await app.getFileCatalogItemByPath(testUser.id, '/1/', FileCatalogItemType.Folder);

        console.log('publishFolder firstFolder', firstFolder.name);
        publishFolderResult = await app.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});

        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName);
        
        assert.equal(gotIndexHtmlByFolder, indexHtml);

        let indexHtml2 = '<h1>Hello world 2</h1>';
        const fileName2 = 'index2.json';
        const filePath2 = foldersPath + fileName2;
        await app.saveData(indexHtml2, fileName2, {userId: testUser.id, path: filePath2 });

        try {
          await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
          assert.equal(true, false);
        } catch (e) {
          assert.equal(e.message, 'file does not exist');
        }

        publishFolderResult = await app.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);

        indexHtml2 = '<h1>Hello world 3</h1>';
        await app.saveData(indexHtml2, fileName2, {userId: testUser.id, path: filePath2 });
        publishFolderResult = await app.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);
        
        indexHtml2 = '<h1>Hello world 2</h1>';
        await app.saveData(indexHtml2, fileName2, {userId: testUser.id, path: filePath2 });
        publishFolderResult = await app.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);
      });

      it('categories should work properly', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];
        const categoryName = 'my-category';
        const category = await app.createCategory(testUser.id, {name: categoryName});

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});
        try {
          await app.addGroupToCategory(newUser.id, testGroup.id, category.id);
          assert(false);
        } catch (e) {
          assert(true);
        }
        await app.addGroupToCategory(testUser.id, testGroup.id, category.id);

        const foundCategory = await app.getCategoryByParams({name: categoryName});
        assert.equal(foundCategory.id, category.id);

        const categoryGroups = await app.database.getGroupsOfCategory(category.id);
        assert.equal(categoryGroups.length, 1);
        assert.equal(categoryGroups[0].id, testGroup.id);

        const postContent = await app.saveData('Hello world', null, {
          userId: newUser.id,
          mimeType: 'text/markdown'
        });

        try {
          await app.createPost(newUser.id, {
            contents: [{id: postContent.id}],
            groupId: testGroup.id,
            status: PostStatus.Published,
            name: 'my-post'
          });
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
        try {
          await app.addMemberToGroup(newUser.id, testGroup.id, newUser.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
        try {
          await app.addMemberToCategory(newUser.id, category.id, newUser.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
        try {
          await app.updateGroup(newUser.id, testGroup.id, {title: 'new title'});
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        assert.equal(await app.isMemberInGroup(newUser.id, testGroup.id), false);
        assert.equal(await app.isMemberInCategory(newUser.id, category.id), false);

        await app.addMemberToGroup(testUser.id, testGroup.id, newUser.id, [GroupPermissionName.EditGeneralData]);
        await app.addMemberToCategory(testUser.id, category.id, newUser.id);

        assert.equal(await app.isMemberInGroup(newUser.id, testGroup.id), true);
        assert.equal(await app.isMemberInCategory(newUser.id, category.id), true);

        let post = await app.createPost(newUser.id, {
          contents: [{id: postContent.id}],
          groupId: testGroup.id,
          status: PostStatus.Published,
          name: 'my-post'
        });

        const foundPost = await app.getPostByParams({
          name: 'my-post',
          groupId: testGroup.id
        });

        assert.equal(post.id, foundPost.id);

        const newUser2 = await app.registerUser({email: 'new@user2.com', name: 'new2', password: 'new2', permissions: [CorePermissionName.UserAll]});

        try {
          await app.addMemberToGroup(newUser.id, testGroup.id, newUser2.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        await app.updateGroup(newUser.id, testGroup.id, {title: 'new title'});

        let group = await app.getGroup(testGroup.id);
        assert.equal(group.title, 'new title');

        await app.addMemberToGroup(testUser.id, testGroup.id, newUser2.id);

        try {
          await app.updateGroup(newUser2.id, testGroup.id, {title: 'new title 2'});
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        group = await app.getGroup(testGroup.id);
        assert.equal(group.title, 'new title');

        let groupPosts = await app.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);
        assert.equal(groupPosts[0].id, post.id);

        let categoryPosts = await app.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 1);
        assert.equal(categoryPosts[0].id, post.id);

        const group2 = await app.createGroup(testUser.id, {
          name: 'test2',
          title: 'Test2'
        });

        try {
          await app.createGroup(testUser.id, {
            name: 'test2',
            title: 'Test2222'
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "already_exists"), true);
        }

        const foundGroup2 = await app.getGroupByParams({
          name: 'test2'
        });

        assert.equal(group2.id, foundGroup2.id);

        const post2Content1 = await app.saveData('Hello world2', null, {
          userId: testUser.id,
          mimeType: 'text/markdown'
        });
        const post2Content2 = await app.saveData('Hello world3', null, {
          userId: testUser.id,
          mimeType: 'text/markdown'
        });

        const post2 = await app.createPost(testUser.id, {
          contents: [{id: post2Content1.id, view: ContentView.Contents}, {manifestStorageId: post2Content2.manifestStorageId, view: ContentView.Attachment}],
          replyToId: post.id,
          groupId: group2.id,
          status: PostStatus.Published
        });

        assert.equal(post2.contents.length, 2);
        assert.equal(await app.storage.getFileData(post2.contents[0].storageId), 'Hello world2');
        assert.equal(post2.contents[0].postsContents.view, ContentView.Contents);
        assert.equal(await app.storage.getFileData(post2.contents[1].storageId), 'Hello world3');
        assert.equal(post2.contents[1].postsContents.view, ContentView.Attachment);

        post = await app.database.getPost(post.id);
        assert.equal(post.repliesCount, 1);

        groupPosts = await app.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);
        assert.equal(groupPosts[0].id, post.id);

        categoryPosts = await app.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 1);
        assert.equal(categoryPosts[0].id, post.id);

        await app.addGroupToCategory(testUser.id, group2.id, category.id);

        groupPosts = await app.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);

        categoryPosts = await app.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 2);

        categoryPosts = await app.database.getCategoryPosts(category.id, {
          replyToId: null
        });
        assert.equal(categoryPosts.length, 1);

        await app.removeMemberFromGroup(testUser.id, testGroup.id, newUser.id);

        try {
          await app.updateGroup(newUser.id, testGroup.id, {title: 'new title 2'});
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
      });
    });
  });
});
