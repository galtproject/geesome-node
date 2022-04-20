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
const trieHelper = require("geesome-libs/src/base36Trie");
const assert = require('assert');
const fs = require('fs');
const _ = require('lodash');
const resourcesHelper = require('./helpers/resources');
const log = require('../components/log');
const commonHelper = require('geesome-libs/src/common');

describe.only("app", function () {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}, storage: 'database-test.sqlite'}};

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
          await app.ms.group.createGroup(testUser.id, {
            name: 'test',
            title: 'Test'
          });
        } catch (e) {
          console.error('error', e);
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
        console.log('ipld1', ipld1);

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

        app.storage.isStreamAddSupport = () => {
          return false;
        };

        const pngImagePath = await resourcesHelper.prepare('input-image.png');
        const imageContent = await app.saveData(fs.createReadStream(pngImagePath), 'input-image.png', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const properties = JSON.parse(imageContent.propertiesJson);
        assert.equal(properties.width > 0, true);

        const contentObj = await app.storage.getObject(imageContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'image/png');
        assert.equal(contentObj.properties.width > 0, true);

        console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType);
        assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
        assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
      });

      it('should correctly save video', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const inputVideo = await resourcesHelper.prepare('not-streamable-input-video.mp4');
        const videoContent = await app.saveData(fs.createReadStream(inputVideo), 'input-video.mp4', {
          userId: testUser.id,
          groupId: testGroup.id
        });

        const contentObj = await app.storage.getObject(videoContent.manifestStorageId);

        assert.equal(ipfsHelper.isIpfsHash(contentObj.storageId), true);
        assert.equal(contentObj.mimeType, 'video/mp4');
        assert.equal(contentObj.properties.width > 0, true);

        console.log('contentObj.preview.medium.mimeType', contentObj.preview.medium.mimeType)
        assert.equal(_.startsWith(contentObj.preview.medium.mimeType, 'image'), true);
        assert.equal(ipfsHelper.isIpfsHash(contentObj.preview.medium.storageId), true);
      });

      it('should correctly save mov video', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const inputVideoPath = await resourcesHelper.prepare('input-video.mov');
        const videoContent = await app.saveData(fs.createReadStream(inputVideoPath), 'input-video.mov', {
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

        const archivePath = await resourcesHelper.prepare('test-archive.zip');
        const archiveContent = await app.saveData(fs.createReadStream(archivePath), 'archive.zip', {userId: testUser.id, driver: 'archive'});

        const contentObj = await app.storage.getObject(archiveContent.manifestStorageId);
        assert.equal(contentObj.mimeType, 'directory');
        assert.equal(contentObj.extension, 'none');
        assert.equal(contentObj.size > 0, true);

        let gotTextContent = await app.storage.getFileDataText(archiveContent.storageId + '/test.txt');
        assert.equal(gotTextContent, 'Test\n');
      });

      it("should create directory by files manifests correctly", async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];

        const indexHtml = '<h1>Hello world</h1>';
        const fileName = 'index.html';
        const foldersPath = '/1/2/3/';

        const indexHtmlContent = await app.saveData(indexHtml, fileName, {userId: testUser.id});

        const resultFolder = await app.ms.fileCatalog.saveManifestsToFolder(testUser.id, foldersPath, [{
          manifestStorageId: indexHtmlContent.manifestStorageId
        }]);
        let publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, resultFolder.id,);

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

        const indexHtmlFileItem = await app.ms.fileCatalog.saveContentByPath(testUser.id, filePath, indexHtmlContent.id);
        assert.equal(indexHtmlFileItem.name, fileName);
        
        let parentFolderId = indexHtmlFileItem.parentItemId;
        let level = 3;
        
        while(parentFolderId) {
          const parentFolder = await app.database.getFileCatalogItem(parentFolderId);
          assert.equal(parentFolder.name, level.toString());
          level -= 1;
          parentFolderId = parentFolder.parentItemId;
        }
        
        const foundIndexHtmlFileContent = await app.ms.fileCatalog.getContentByPath(testUser.id, filePath);

        assert.equal(foundIndexHtmlFileContent.id, indexHtmlFileItem.content.id);
        
        const gotIndexHtml = await app.storage.getFileData(indexHtmlFileItem.content.storageId);
        
        assert.equal(gotIndexHtml, indexHtml);

        let publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, indexHtmlFileItem.parentItemId, {bindToStatic: true});
        
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
        
        const firstFolder = await app.ms.fileCatalog.getFileCatalogItemByPath(testUser.id, '/1/', FileCatalogItemType.Folder);

        publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});

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

        publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);

        indexHtml2 = '<h1>Hello world 3</h1>';
        await app.saveData(indexHtml2, fileName2, {userId: testUser.id, path: filePath2 });
        publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);

        indexHtml2 = '<h1>Hello world 2</h1>';
        await app.saveData(indexHtml2, fileName2, {userId: testUser.id, path: filePath2 });
        publishFolderResult = await app.ms.fileCatalog.publishFolder(testUser.id, firstFolder.id, {bindToStatic: true});
        gotIndexHtmlByFolder = await app.storage.getFileData(publishFolderResult.storageId + '/2/3/' + fileName2);
        assert.equal(gotIndexHtmlByFolder, indexHtml2);
      });

      it('categories should work properly', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];
        const categoryName = 'my-category';
        const category = await app.ms.groupCategory.createCategory(testUser.id, {name: categoryName});

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});
        try {
          await app.ms.groupCategory.addGroupToCategory(newUser.id, testGroup.id, category.id);
          assert(false);
        } catch (e) {
          assert(true);
        }
        await app.ms.groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

        const foundCategory = await app.ms.groupCategory.getCategoryByParams({name: categoryName});
        assert.equal(foundCategory.id, category.id);

        const categoryGroups = await app.database.getCategoryGroups(category.id);
        console.log('categoryGroups', categoryGroups);
        assert.equal(categoryGroups.length, 1);
        assert.equal(categoryGroups[0].id, testGroup.id);

        const categoryGroupsCount = await app.database.getCategoryGroupsCount(category.id);
        console.log('categoryGroupsCount', categoryGroupsCount);
        assert.equal(categoryGroupsCount, 1);

        const postContent = await app.saveData('Hello world', null, {
          userId: newUser.id,
          mimeType: 'text/markdown'
        });

        try {
          await app.ms.group.createPost(newUser.id, {
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
          await app.ms.group.addMemberToGroup(newUser.id, testGroup.id, newUser.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
        try {
          await app.ms.groupCategory.addMemberToCategory(newUser.id, category.id, newUser.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
        try {
          await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title'});
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        assert.equal(await app.ms.group.isMemberInGroup(newUser.id, testGroup.id), false);
        assert.equal(await app.ms.groupCategory.isMemberInCategory(newUser.id, category.id), false);

        await app.ms.group.addMemberToGroup(testUser.id, testGroup.id, newUser.id, [GroupPermissionName.EditGeneralData]);
        await app.ms.groupCategory.addMemberToCategory(testUser.id, category.id, newUser.id);

        assert.equal(await app.ms.group.isMemberInGroup(newUser.id, testGroup.id), true);
        assert.equal(await app.ms.groupCategory.isMemberInCategory(newUser.id, category.id), true);

        let post = await app.ms.group.createPost(newUser.id, {
          contents: [{id: postContent.id}],
          groupId: testGroup.id,
          status: PostStatus.Published,
          name: 'my-post'
        });

        const manifestId = await app.communicator.resolveStaticId(testGroup.staticStorageId);
        console.log('testGroup.staticStorageId', testGroup.staticStorageId, 'manifestId', manifestId);
        const groupManifest = await app.storage.getObject(manifestId);
        console.log('groupManifest', groupManifest);

        const postNumberPath = trieHelper.getTreePostCidPath(manifestId, 1);
        const postManifest = await app.storage.getObject(postNumberPath);
        assert.equal(postManifest.contents[0].storageId, postContent.manifestStorageId);
        const postManifestStorageId = await app.storage.getObject(postNumberPath, false);
        assert.equal(postManifestStorageId, post.manifestStorageId);

        let foundPost = await app.ms.group.getPostByParams({
          name: 'my-post',
          groupId: testGroup.id
        });

        assert.equal(post.id, foundPost.id);

        const postContent2 = await app.saveData('Hello world2', null, {
          userId: newUser.id,
          mimeType: 'text/markdown'
        });

        await app.ms.group.updatePost(newUser.id, post.id, {
          contents: [{id: postContent.id}, {id: postContent2.id}]
        });

        foundPost = await app.ms.group.getPostByParams({
          name: 'my-post',
          groupId: testGroup.id
        });
        assert.equal(foundPost.contents.length, 2);
        assert.equal(foundPost.contents[0].id, postContent.id);
        assert.equal(foundPost.contents[1].id, postContent2.id);

        const newUser2 = await app.registerUser({email: 'new@user2.com', name: 'new2', password: 'new2', permissions: [CorePermissionName.UserAll]});

        try {
          await app.ms.group.addMemberToGroup(newUser.id, testGroup.id, newUser2.id);
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title', name: 'newGroupName'});

        let group = await app.ms.group.getGroup(testGroup.id);
        assert.equal(group.title, 'new title');
        assert.equal(group.name, testGroup.name);

        await app.ms.group.addMemberToGroup(testUser.id, testGroup.id, newUser2.id);

        try {
          await app.ms.group.updateGroup(newUser2.id, testGroup.id, {title: 'new title 2'});
          assert(false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        group = await app.ms.group.getGroup(testGroup.id);
        assert.equal(group.title, 'new title');

        let groupPosts = await app.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);
        assert.equal(groupPosts[0].id, post.id);

        let categoryPosts = await app.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 1);
        assert.equal(categoryPosts[0].id, post.id);

        const group2 = await app.ms.group.createGroup(testUser.id, {
          name: 'test2',
          title: 'Test2'
        });

        try {
          await app.ms.group.updatePost(newUser.id, post.id, {
            contents: [{id: postContent.id}, {id: postContent2.id}],
            groupId: group2.id
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        try {
          await app.ms.group.createGroup(testUser.id, {
            name: 'test2',
            title: 'Test2222'
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "already_exists"), true);
        }

        const foundGroup2 = await app.ms.group.getGroupByParams({
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

        const post2 = await app.ms.group.createPost(testUser.id, {
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

        await app.ms.groupCategory.addGroupToCategory(testUser.id, group2.id, category.id);

        groupPosts = await app.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);

        categoryPosts = await app.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 2);

        categoryPosts = await app.database.getCategoryPosts(category.id, {
          replyToId: null
        });
        assert.equal(categoryPosts.length, 1);

        await app.ms.group.removeMemberFromGroup(testUser.id, testGroup.id, newUser.id);

        try {
          await app.ms.group.updateGroup(newUser.id, testGroup.id, {title: 'new title 2'});
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
      });

      it('sections should work properly', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];
        const categoryName = 'my-category';
        const category = await app.ms.groupCategory.createCategory(testUser.id, {name: categoryName});

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});

        let groupSection1 = await app.ms.groupCategory.createGroupSection(testUser.id, {
          name: 'test',
          title: 'Test2'
        });

        console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
        groupSection1 = await app.ms.groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
          title: 'Test2 changed'
        });

        assert.equal(groupSection1.title, 'Test2 changed');

        try {
          await app.ms.groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
        groupSection1 = await app.ms.groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
          title: 'Test2 changed',
          categoryId: category.id
        });
        assert.equal(groupSection1.categoryId, category.id);

        try {
          await app.ms.groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        console.log('app.addAdminToCategory(testUser.id, category.id, newUser.id)');
        await app.ms.groupCategory.addAdminToCategory(testUser.id, category.id, newUser.id);

        console.log('app.ms.group.updateGroupSection(newUser.id, groupSection1.id');
        groupSection1 = await app.ms.groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });

        assert.equal(groupSection1.title, 'Test2 changed 2');

        console.log('app.ms.group.updateGroup(testUser.id, testGroup.id');
        await app.ms.group.updateGroup(testUser.id, testGroup.id, {
          sectionId: groupSection1.id
        });

        console.log('app.ms.group.createGroupSection(testUser.id');
        await app.ms.groupCategory.createGroupSection(testUser.id, {
          name: 'test',
          title: 'Test3'
        });

        const sectionsData = await app.ms.groupCategory.getGroupSectionItems({categoryId: category.id});
        assert.equal(sectionsData.total, 1);
      });

      it('isReplyForbidden should work properly', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const postContent = await app.saveData('Hello world', null, {
          userId: testUser.id,
          mimeType: 'text/markdown'
        });

        const testPost = await app.ms.group.createPost(testUser.id, {
          contents: [{id: postContent.id, view: ContentView.Contents}],
          groupId: testGroup.id,
          status: PostStatus.Published
        });

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});

        const group2 = await app.ms.group.createGroup(newUser.id, { name: 'test2', title: 'Test2' });

        await app.ms.group.createPost(newUser.id, {
          contents: [{id: postContent.id, view: ContentView.Contents}],
          replyToId: testPost.id,
          groupId: group2.id,
          status: PostStatus.Published
        });

        await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: true});

        try {
          await app.ms.group.createPost(newUser.id, {
            contents: [{id: postContent.id, view: ContentView.Contents}],
            replyToId: testPost.id,
            groupId: group2.id,
            status: PostStatus.Published
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: false});

        await app.ms.group.createPost(newUser.id, {
          contents: [{id: postContent.id, view: ContentView.Contents}],
          replyToId: testPost.id,
          groupId: group2.id,
          status: PostStatus.Published
        });

        await app.ms.group.updateGroup(testUser.id, testGroup.id, {isReplyForbidden: false});

        await app.ms.group.createPost(newUser.id, {
          contents: [{id: postContent.id, view: ContentView.Contents}],
          replyToId: testPost.id,
          groupId: group2.id,
          status: PostStatus.Published
        });

        await app.ms.group.updatePost(testUser.id, testPost.id, {isReplyForbidden: true});

        try {
          await app.ms.group.createPost(newUser.id, {
            contents: [{id: postContent.id, view: ContentView.Contents}],
            replyToId: testPost.id,
            groupId: group2.id,
            status: PostStatus.Published
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }
      });

      it('groups administration', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});
        const newUser2 = await app.registerUser({email: 'new2@user.com', name: 'new2', password: 'new2', permissions: [CorePermissionName.UserAll]});

        assert.equal(await app.ms.group.isAdminInGroup(testUser.id, testGroup.id), true);
        assert.equal(await app.ms.group.isAdminInGroup(newUser.id, testGroup.id), false);
        assert.equal(await app.ms.group.isAdminInGroup(newUser2.id, testGroup.id), false);

        await app.ms.group.setAdminsOfGroup(testUser.id, testGroup.id, [newUser.id, newUser2.id]);

        assert.equal(await app.ms.group.isAdminInGroup(testUser.id, testGroup.id), false);
        assert.equal(await app.ms.group.isAdminInGroup(newUser.id, testGroup.id), true);
        assert.equal(await app.ms.group.isAdminInGroup(newUser2.id, testGroup.id), true);

        await app.ms.group.setMembersOfGroup(newUser.id, testGroup.id, [testUser.id]);

        assert.equal(await app.ms.group.isMemberInGroup(testUser.id, testGroup.id), true);

      });

      it('membershipOfCategory', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const category = await app.ms.groupCategory.createCategory(testUser.id, {name: 'category'});
        await app.ms.groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

        const newMember = await app.registerUser({email: 'new1user.com', name: 'new1', password: 'new1', permissions: [CorePermissionName.UserAll]});

        const post1Content = await app.saveData('Hello world1', null, {
          userId: newMember.id,
          mimeType: 'text/markdown'
        });

        const postData = {
          contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
          groupId: testGroup.id,
          status: PostStatus.Published
        };
        try {
          await app.ms.group.createPost(newMember.id, postData);
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        await app.ms.groupCategory.addMemberToCategory(testUser.id, category.id, newMember.id);

        try {
          await app.ms.group.createPost(newMember.id, postData);
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        await app.ms.group.updateGroup(testUser.id, testGroup.id, {
          membershipOfCategoryId: category.id
        });

        const post = await app.ms.group.createPost(newMember.id, postData);
        assert.equal(post.groupId, testGroup.id);
      });

      it('groupRead', async () => {
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testGroup = (await app.database.getAllGroupList('test'))[0];

        const post1Content = await app.saveData('Hello world1', null, {
          userId: testUser.id,
          mimeType: 'text/markdown'
        });
        const postData = {
          contents: [{manifestStorageId: post1Content.manifestStorageId, view: ContentView.Attachment}],
          groupId: testGroup.id,
          status: PostStatus.Published
        };
        let post = await app.ms.group.createPost(testUser.id, postData);

        assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 1);

        await app.ms.group.addOrUpdateGroupRead(testUser.id, {
          groupId: testGroup.id,
          readAt: post.publishedAt
        });

        assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 0);

        await app.ms.group.createPost(testUser.id, postData);

        assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 1);

        post = await app.ms.group.createPost(testUser.id, postData);

        assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 2);

        await app.ms.group.addOrUpdateGroupRead(testUser.id, {
          groupId: testGroup.id,
          readAt: post.publishedAt
        });

        assert.equal((await app.ms.group.getGroupUnreadPostsData(testUser.id, testGroup.id)).count, 0);
      });

      it('user accounts should work properly', async () => {
        const userAccountPrivateKey = '0xec63de747a7872b20793af42814ce92b5749dd13017887b6ab26754907b4934f';
        const userAccountAddress = '0x2FAa9af0dbD9d32722C494bAD6B4A2521d132003';

        const newMember = await app.registerUser({
          email: 'new1user.com',
          name: 'new1',
          password: 'new1',
          permissions: [CorePermissionName.UserAll],
          accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
        });
        assert.equal(newMember.accounts.length, 1);
        assert.equal(newMember.accounts[0].provider, 'ethereum');
        assert.equal(newMember.accounts[0].address, userAccountAddress.toLowerCase());

        const userAccounts = await app.database.getUserAccountList(newMember.id);
        assert.equal(userAccounts.length, 1);
        assert.equal(userAccounts[0].provider, 'ethereum');
        assert.equal(userAccounts[0].address, userAccountAddress.toLowerCase());

        const userObject = await app.getDataStructure(newMember.manifestStorageId);
        assert.equal(userObject.accounts.length, 1);
        assert.equal(userObject.accounts[0].provider, 'ethereum');
        assert.equal(userObject.accounts[0].address, userAccountAddress.toLowerCase());
      });

      it('user invites should work properly', async () => {
        const userAccountAddress = '0x2FAa9af0dbD9d32722C494bAD6B4A2521d132003';
        const testGroup = (await app.database.getAllGroupList('test'))[0];
        const testUser = (await app.database.getAllUserList('user'))[0];
        const testAdmin = (await app.database.getAllUserList('admin'))[0];

        const invite = await app.ms.invite.createInvite(testAdmin.id, {
          title: 'test invite',
          limits: JSON.stringify([{ name: UserLimitName.SaveContentSize, value: 100 * (10 ** 3), periodTimestamp: 60, isActive: true }]),
          permissions: JSON.stringify([CorePermissionName.UserAll]),
          groupsToJoin: JSON.stringify([testGroup.manifestStaticStorageId]),
          maxCount: 1,
          isActive: true
        });

        const newMember = await app.ms.invite.registerUserByInviteCode(invite.code, {
          email: 'new2user.com',
          name: 'new2',
          password: 'new2',
          permissions: [CorePermissionName.UserAll],
          accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
        });
        assert.equal(newMember.joinedByInviteId, invite.id);
        assert.equal(newMember.accounts.length, 1);
        assert.equal(newMember.accounts[0].provider, 'ethereum');
        assert.equal(newMember.accounts[0].address, userAccountAddress.toLowerCase());

        const userLimit = await app.getUserLimit(testAdmin.id, newMember.id, UserLimitName.SaveContentSize);
        assert.equal(userLimit.isActive, true);
        assert.equal(userLimit.periodTimestamp, 60);
        assert.equal(userLimit.value, 100 * (10 ** 3));

        assert.equal(await app.database.isHaveCorePermission(newMember.id, CorePermissionName.UserAll), true);

        assert.equal(await app.ms.group.isMemberInGroup(newMember.id, testGroup.id), false);

        await app.ms.group.addAdminToGroup(testUser.id, testGroup.id, testAdmin.id);

        try {
          await app.ms.invite.registerUserByInviteCode(commonHelper.random('hash'), {
            email: 'new3user.com',
            name: 'new3',
            password: 'new3',
            permissions: [CorePermissionName.UserAll],
            accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "invite_not_found"), true);
        }

        try {
          await app.ms.invite.registerUserByInviteCode(invite.code, {
            email: 'new3user.com',
            name: 'new3',
            password: 'new3',
            permissions: [CorePermissionName.UserAll],
            accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "invite_max_count"), true);
        }

        await app.ms.invite.updateInvite(testAdmin.id, invite.id, {maxCount: 3});
        const foundInvite = await app.database.findInviteByCode(invite.code);
        assert.equal(foundInvite.maxCount, 3);

        const newMember3 = await app.ms.invite.registerUserByInviteCode(invite.code, {
          email: 'new3user.com',
          name: 'new3',
          password: 'new3',
          permissions: [CorePermissionName.UserAll],
          accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
        });

        assert.equal(await app.ms.group.isMemberInGroup(newMember.id, testGroup.id), false);
        assert.equal(await app.ms.group.isMemberInGroup(newMember3.id, testGroup.id), true);

        await app.ms.invite.updateInvite(testAdmin.id, invite.id, {isActive: false});

        try {
          await app.ms.invite.registerUserByInviteCode(invite.code, {
            email: 'new4user.com',
            name: 'new4',
            password: 'new4',
            permissions: [CorePermissionName.UserAll],
            accounts: [{'address': userAccountAddress, 'provider': 'ethereum'}]
          });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "invite_not_active"), true);
        }
      });
    });
  });
});
