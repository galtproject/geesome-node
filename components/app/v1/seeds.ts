import {ContentType, GroupType, GroupView, PostStatus} from "../../database/interface";
import {IGeesomeApp} from "../interface";

const bcrypt = require('bcrypt');
const saltRounds = 10;

module.exports = (app: IGeesomeApp) => {
    return new Promise((resolve, reject) => {
        bcrypt.hash('admin', saltRounds, async (err, passwordHash) => {
            const storageAccountId = await app.storage.getCurrentAccountId();
            
            const adminUser = await app.database.addUser({ storageAccountId, name: 'admin', title: 'Admin', passwordHash });
            
            const userId = adminUser.id;

            const avatar1Image = await app.storage.saveFileByUrl('https://placeimg.com/40/40/nature/5');
            const avatar1ImageContent = await app.database.addContent({ userId, storageAccountId, storageId: avatar1Image.id, size: avatar1Image.size, name: '', isPublic: true, type: ContentType.ImageJpg});

            const feedGroup = await app.database.addGroup({ storageAccountId, name: 'feed', title: 'Feed', avatarImageId: avatar1ImageContent.id, isPublic: true, type: GroupType.Channel, view: GroupView.FullList });

            await app.database.addAdminToGroup(adminUser.id, feedGroup.id);

            const avatar2Image = await app.storage.saveFileByUrl('https://placeimg.com/40/40/nature/6');
            const avatar2ImageContent = await app.database.addContent({ userId, storageAccountId, storageId: avatar2Image.id, size: avatar2Image.size, name: '', isPublic: true, type: ContentType.ImageJpg});

            const savedGroup = await app.database.addGroup({ storageAccountId, name: 'favorites', title: 'Favorites', avatarImageId: avatar2ImageContent.id, isPublic: false, type: GroupType.Channel, view: GroupView.Grid });

            await app.database.addAdminToGroup(adminUser.id, savedGroup.id);

            const avatar3Image = await app.storage.saveFileByUrl('https://placeimg.com/40/40/nature/7');
            const avatar3ImageContent = await app.database.addContent({ userId, storageAccountId, storageId: avatar3Image.id, size: avatar3Image.size, name: '', isPublic: true, type: ContentType.ImageJpg});

            const testGroup = await app.database.addGroup({ storageAccountId, name: 'test', title: 'Test', avatarImageId: avatar3ImageContent.id, isPublic: true, type: GroupType.Channel, view: GroupView.Grid});

            await app.database.addMemberToGroup(adminUser.id, testGroup.id);

            const post1Text = await app.storage.saveFileByContent('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.');
            const post1Image = await app.storage.saveFileByUrl('https://placeimg.com/1000/340/nature/1');

            const post1Content1 = await app.database.addContent({ userId, storageAccountId, groupId: testGroup.id, storageId: post1Text.id, size: post1Text.size, name: '', isPublic: true, type: ContentType.Text});
            const post1Content2 = await app.database.addContent({userId, storageAccountId, groupId: testGroup.id, storageId: post1Image.id, size: post1Image.size, name: '', isPublic: true, type: ContentType.ImageJpg});

            const post1 = await app.database.addPost({userId, storageAccountId, groupId: testGroup.id, status: PostStatus.Published, publishedAt: new Date()});

            await app.database.setPostContents(post1.id, [post1Content1.id, post1Content2.id]);

            const post2Text = await app.storage.saveFileByContent('Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat');
            const post2Image = await app.storage.saveFileByUrl('https://placeimg.com/1000/340/nature/2');

            const post2Content1 = await app.database.addContent({userId, storageAccountId, groupId: testGroup.id, storageId: post2Image.id, size: post2Image.size, name: '', isPublic: true, type: ContentType.ImageJpg});
            const post2Content2 = await app.database.addContent({ userId, storageAccountId, groupId: testGroup.id, storageId: post2Text.id, size: post2Text.size, name: '', isPublic: true, type: ContentType.Text});

            const post2 = await app.database.addPost({userId, storageAccountId, groupId: testGroup.id, status: PostStatus.Published, publishedAt: new Date()});

            await app.database.setPostContents(post2.id, [post2Content1.id, post2Content2.id]);
            resolve();
        });
    });
};
