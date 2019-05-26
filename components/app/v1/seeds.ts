import {CorePermissionName, GroupType, GroupView, PostStatus} from "../../database/interface";
import {IGeesomeApp} from "../interface";
const fs = require('fs');

module.exports = async (app: IGeesomeApp) => {
        const adminUser = await app.registerUser('info@galtproject.io', 'admin', 'admin');
        
        await app.database.addCorePermission(adminUser.id, CorePermissionName.AdminRead);
        await app.database.addCorePermission(adminUser.id, CorePermissionName.AdminAddUser);
        await app.database.addCorePermission(adminUser.id, CorePermissionName.AdminSetUserLimit);
        await app.database.addCorePermission(adminUser.id, CorePermissionName.AdminAddUserApiKey);

        const testUser = await app.registerUser('test@galtproject.io', 'test', 'test');
        
        const userId = adminUser.id;
        
        function getExampleContent(fileName) {
                return fs.createReadStream(`${__dirname}/../../../exampleContent/${fileName}`);
        }
        
        const myBlogGroup = await app.createGroup(userId, { name: 'my_blog', title: 'My blog', isPublic: true, type: GroupType.Channel, view: GroupView.TumblrLike });
        const avatar1ImageContent = await app.saveData(getExampleContent("avatar1.jpg"), "avatar1.jpg", {userId, groupId: myBlogGroup.id});
        const cover1ImageContent = await app.saveData(getExampleContent("cover1.jpg"), "cover1.jpg", {userId, groupId: myBlogGroup.id});
        await app.updateGroup(myBlogGroup.id, {avatarImageId: avatar1ImageContent.id, coverImageId: cover1ImageContent.id});

        const favoritesGroup = await app.createGroup(userId, { name: 'favorites', title: 'Favorites', isPublic: false, type: GroupType.Channel, view: GroupView.InstagramLike });
        const avatar2ImageContent = await app.saveData(getExampleContent("avatar2.jpg"), "avatar2.jpg", {userId, groupId: favoritesGroup.id});
        const cover2ImageContent = await app.saveData(getExampleContent("cover2.jpg"), "cover2.jpg", {userId, groupId: favoritesGroup.id});
        await app.updateGroup(favoritesGroup.id, {avatarImageId: avatar2ImageContent.id, coverImageId: cover2ImageContent.id});
        
        const testGroup = await app.createGroup(testUser.id, { name: 'test', title: 'Test', isPublic: true, type: GroupType.Channel, view: GroupView.InstagramLike});
        const avatar3ImageContent = await app.saveData(getExampleContent("avatar3.jpg"), "avatar3.jpg", {userId, groupId: testGroup.id});
        const cover3ImageContent = await app.saveData(getExampleContent("cover3.jpg"), "cover3.jpg", {userId, groupId: testGroup.id});
        await app.updateGroup(testGroup.id, {avatarImageId: avatar3ImageContent.id, coverImageId: cover3ImageContent.id});
        await app.database.addMemberToGroup(adminUser.id, testGroup.id);

        const post1Content1 = await app.saveData(getExampleContent("post1.jpg"), "post1.jpg", {userId, groupId: testGroup.id});
        const post1Content2 = await app.saveData('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'lorem.txt', {userId, groupId: testGroup.id});
        await app.createPost(userId, { groupId: testGroup.id, status: PostStatus.Published, contentsIds: [post1Content1.id, post1Content2.id]});
        
        const post2Content1 = await app.saveData('Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat', 'ut-enim.txt', {userId, groupId: testGroup.id});
        const post2Content2 = await app.saveData(getExampleContent("post2.jpg"), "post2.jpg", {userId, groupId: testGroup.id});
        await app.createPost(userId, { groupId: testGroup.id, status: PostStatus.Published, contentsIds: [post2Content1.id, post2Content2.id]});
};
