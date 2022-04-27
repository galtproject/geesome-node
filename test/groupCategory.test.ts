/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {IGeesomeApp, IGeesomeGroupCategoryModule} from "../components/app/interface";
import {
  ContentView,
  CorePermissionName,
  GroupPermissionName,
  PostStatus,
} from "../components/app/v1/modules/database/interface";

const trieHelper = require("geesome-libs/src/base36Trie");
const assert = require('assert');
const _ = require('lodash');

describe("groupCategory", function () {
  const databaseConfig = {name: 'geesome_test', options: {logging: () => {}, storage: 'database-test.sqlite'}};

  this.timeout(60000);

  let app: IGeesomeApp, groupCategory: IGeesomeGroupCategoryModule;

  const versions = ['v1'];//'ipfs-http-client'

  versions.forEach((appVersion) => {
    describe('app ' + appVersion, () => {
      beforeEach(async () => {
        const appConfig = require('../components/app/v1/config');
        appConfig.storageConfig.implementation = 'js-ipfs';
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
          groupCategory = app.ms['groupCategory'];
        } catch (e) {
          console.error('error', e);
          assert.equal(true, false);
        }
      });
      
      afterEach(async () => {
        await app.ms.database.flushDatabase();
        await app.stop();
      });

      it('categories should work properly', async () => {
        const testUser = (await app.ms.database.getAllUserList('user'))[0];
        const testGroup = (await app.ms.database.getAllGroupList('test'))[0];
        const categoryName = 'my-category';
        const category = await groupCategory.createCategory(testUser.id, {name: categoryName});

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});
        try {
          await groupCategory.addGroupToCategory(newUser.id, testGroup.id, category.id);
          assert(false);
        } catch (e) {
          assert(true);
        }
        await groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

        const foundCategory = await groupCategory.getCategoryByParams({name: categoryName});
        assert.equal(foundCategory.id, category.id);

        const categoryGroups = await app.ms.database.getCategoryGroups(category.id);
        console.log('categoryGroups', categoryGroups);
        assert.equal(categoryGroups.length, 1);
        assert.equal(categoryGroups[0].id, testGroup.id);

        const categoryGroupsCount = await app.ms.database.getCategoryGroupsCount(category.id);
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
          await groupCategory.addMemberToCategory(newUser.id, category.id, newUser.id);
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
        assert.equal(await groupCategory.isMemberInCategory(newUser.id, category.id), false);

        await app.ms.group.addMemberToGroup(testUser.id, testGroup.id, newUser.id, [GroupPermissionName.EditGeneralData]);
        await groupCategory.addMemberToCategory(testUser.id, category.id, newUser.id);

        assert.equal(await app.ms.group.isMemberInGroup(newUser.id, testGroup.id), true);
        assert.equal(await groupCategory.isMemberInCategory(newUser.id, category.id), true);

        let post = await app.ms.group.createPost(newUser.id, {
          contents: [{id: postContent.id}],
          groupId: testGroup.id,
          status: PostStatus.Published,
          name: 'my-post'
        });

        const manifestId = await app.ms.communicator.resolveStaticId(testGroup.staticStorageId);
        console.log('testGroup.staticStorageId', testGroup.staticStorageId, 'manifestId', manifestId);
        const groupManifest = await app.ms.storage.getObject(manifestId);
        console.log('groupManifest', groupManifest);

        const postNumberPath = trieHelper.getTreePostCidPath(manifestId, 1);
        const postManifest = await app.ms.storage.getObject(postNumberPath);
        assert.equal(postManifest.contents[0].storageId, postContent.manifestStorageId);
        const postManifestStorageId = await app.ms.storage.getObject(postNumberPath, false);
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

        let groupPosts = await app.ms.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);
        assert.equal(groupPosts[0].id, post.id);

        let categoryPosts = await app.ms.database.getCategoryPosts(category.id);
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
        assert.equal(await app.ms.storage.getFileData(post2.contents[0].storageId), 'Hello world2');
        assert.equal(post2.contents[0].postsContents.view, ContentView.Contents);
        assert.equal(await app.ms.storage.getFileData(post2.contents[1].storageId), 'Hello world3');
        assert.equal(post2.contents[1].postsContents.view, ContentView.Attachment);

        post = await app.ms.database.getPost(post.id);
        assert.equal(post.repliesCount, 1);

        groupPosts = await app.ms.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);
        assert.equal(groupPosts[0].id, post.id);

        categoryPosts = await app.ms.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 1);
        assert.equal(categoryPosts[0].id, post.id);

        await groupCategory.addGroupToCategory(testUser.id, group2.id, category.id);

        groupPosts = await app.ms.database.getGroupPosts(testGroup.id);
        assert.equal(groupPosts.length, 1);

        categoryPosts = await app.ms.database.getCategoryPosts(category.id);
        assert.equal(categoryPosts.length, 2);

        categoryPosts = await app.ms.database.getCategoryPosts(category.id, {
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
        const testUser = (await app.ms.database.getAllUserList('user'))[0];
        const testGroup = (await app.ms.database.getAllGroupList('test'))[0];
        const categoryName = 'my-category';
        const category = await groupCategory.createCategory(testUser.id, {name: categoryName});

        const newUser = await app.registerUser({email: 'new@user.com', name: 'new', password: 'new', permissions: [CorePermissionName.UserAll]});

        let groupSection1 = await groupCategory.createGroupSection(testUser.id, {
          name: 'test',
          title: 'Test2'
        });

        console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
        groupSection1 = await groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
          title: 'Test2 changed'
        });

        assert.equal(groupSection1.title, 'Test2 changed');

        try {
          await groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        console.log('app.ms.group.updateGroupSection(testUser.id, groupSection1.id');
        groupSection1 = await groupCategory.updateGroupSection(testUser.id, groupSection1.id, {
          title: 'Test2 changed',
          categoryId: category.id
        });
        assert.equal(groupSection1.categoryId, category.id);

        try {
          await groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });
          assert.equal(true, false);
        } catch (e) {
          assert.equal(_.includes(e.toString(), "not_permitted"), true);
        }

        console.log('app.addAdminToCategory(testUser.id, category.id, newUser.id)');
        await groupCategory.addAdminToCategory(testUser.id, category.id, newUser.id);

        console.log('app.ms.group.updateGroupSection(newUser.id, groupSection1.id');
        groupSection1 = await groupCategory.updateGroupSection(newUser.id, groupSection1.id, { title: 'Test2 changed 2' });

        assert.equal(groupSection1.title, 'Test2 changed 2');

        console.log('app.ms.group.updateGroup(testUser.id, testGroup.id');
        await app.ms.group.updateGroup(testUser.id, testGroup.id, {
          sectionId: groupSection1.id
        });

        console.log('app.ms.group.createGroupSection(testUser.id');
        await groupCategory.createGroupSection(testUser.id, {
          name: 'test',
          title: 'Test3'
        });

        const sectionsData = await groupCategory.getGroupSectionItems({categoryId: category.id});
        assert.equal(sectionsData.total, 1);
      });

      it('membershipOfCategory', async () => {
        const testUser = (await app.ms.database.getAllUserList('user'))[0];
        const testGroup = (await app.ms.database.getAllGroupList('test'))[0];

        const category = await groupCategory.createCategory(testUser.id, {name: 'category'});
        await groupCategory.addGroupToCategory(testUser.id, testGroup.id, category.id);

        const newMember = await app.registerUser({email: 'new1@user.com', name: 'new1', password: 'new1', permissions: [CorePermissionName.UserAll]});

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

        await groupCategory.addMemberToCategory(testUser.id, category.id, newMember.id);

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
    });
  });
});
