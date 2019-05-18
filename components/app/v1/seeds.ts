import {GroupType, GroupView, PostStatus} from "../../database/interface";
import {IGeesomeApp} from "../interface";


module.exports = async (app: IGeesomeApp) => {
        const adminUser = await app.registerUser('info@galtproject.io', 'admin', 'admin');
        
        const userId = adminUser.id;
        
        const myBlogGroup = await app.createGroup(userId, { name: 'my_blog', title: 'My blog', isPublic: true, type: GroupType.Channel, view: GroupView.FullList });
        const avatar1ImageContent = await app.saveDataByUrl('https://placeimg.com/80/80/nature/img.jpg', {userId, groupId: myBlogGroup.id});
        const cover1ImageContent = await app.saveDataByUrl('https://placeimg.com/1000/340/nature/img.jpg', {userId, groupId: myBlogGroup.id});
        await app.updateGroup(myBlogGroup.id, {avatarImageId: avatar1ImageContent.id, coverImageId: cover1ImageContent.id});
        await app.database.addAdminToGroup(adminUser.id, myBlogGroup.id);

        const favoritesGroup = await app.createGroup(userId, { name: 'favorites', title: 'Favorites', isPublic: false, type: GroupType.Channel, view: GroupView.Grid });
        const avatar2ImageContent = await app.saveDataByUrl('https://placeimg.com/80/80/nature/img.jpg', {userId, groupId: favoritesGroup.id});
        const cover2ImageContent = await app.saveDataByUrl('https://placeimg.com/1000/340/nature/img.jpg', {userId, groupId: favoritesGroup.id});
        await app.updateGroup(favoritesGroup.id, {avatarImageId: avatar2ImageContent.id, coverImageId: cover2ImageContent.id});
        await app.database.addAdminToGroup(adminUser.id, favoritesGroup.id);
        
        const testGroup = await app.createGroup(userId, { name: 'test', title: 'Test', isPublic: true, type: GroupType.Channel, view: GroupView.Grid});
        const avatar3ImageContent = await app.saveDataByUrl('https://placeimg.com/80/80/nature/img.jpg', {userId, groupId: testGroup.id});
        const cover3ImageContent = await app.saveDataByUrl('https://placeimg.com/1000/340/nature/img.jpg', {userId, groupId: testGroup.id});
        await app.updateGroup(testGroup.id, {avatarImageId: avatar3ImageContent.id, coverImageId: cover3ImageContent.id});
        await app.database.addMemberToGroup(adminUser.id, testGroup.id);

        const post1Content1 = await app.saveDataByUrl('https://placeimg.com/1000/340/nature/img.jpg', {userId, groupId: testGroup.id});
        const post1Content2 = await app.saveData('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.', 'lorem.txt', {userId, groupId: testGroup.id});
        await app.createPost(userId, { groupId: testGroup.id, status: PostStatus.Published, contentsIds: [post1Content1.id, post1Content2.id]});

        const post2Content1 = await app.saveDataByUrl('https://placeimg.com/1000/340/nature/img.jpg', {userId, groupId: testGroup.id});
        const post2Content2 = await app.saveData('Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat', 'ut-enim.txt', {userId, groupId: testGroup.id});
        await app.createPost(userId, { groupId: testGroup.id, status: PostStatus.Published, contentsIds: [post2Content1.id, post2Content2.id]});
};
