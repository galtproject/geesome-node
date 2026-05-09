/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */
import {Sequelize, DataTypes} from 'sequelize';

export default async function (sequelize: Sequelize, models) {

  const Tag = sequelize.define('tag', {
    // http://docs.sequelizejs.com/manual/tutorial/models-definition.html#data-types
    name: {
      type: DataTypes.STRING(200)
    },
    title: {
      type: DataTypes.STRING
    },
    description: {
      type: DataTypes.STRING
    },
    credentials: {
      type: DataTypes.STRING
    },
    avatarImageId: {
      type: DataTypes.INTEGER
    },
    coverImageId: {
      type: DataTypes.INTEGER
    },
    isGlobal: {
      type: DataTypes.BOOLEAN
    },
    storageId: {
      type: DataTypes.STRING(200)
    },
    staticStorageId: {
      type: DataTypes.STRING(200)
    },
    storageAccountId: {
      type: DataTypes.STRING(200)
    },
    manifestStorageId: {
      type: DataTypes.STRING(200)
    },
    manifestStaticStorageId: {
      type: DataTypes.STRING(200)
    }
  } as any, {
    indexes: [
      { name: 'tags_name_idx', fields: ['name'] },
      { name: 'tags_manifest_storage_idx', fields: ['manifestStorageId'] },
      { name: 'tags_manifest_static_storage_idx', fields: ['manifestStaticStorageId'] },
    ]
  } as any);

  models.TaggedPosts = sequelize.define('taggedPosts', {} as any, {
    indexes: [
      { name: 'tagged_posts_post_tag_idx', fields: ['postId', 'tagId'] },
      { name: 'tagged_posts_tag_post_idx', fields: ['tagId', 'postId'] },
    ]
  } as any);

  Tag.belongsToMany(models.Post, {as: 'post', through: models.TaggedPosts});
  models.Post.belongsToMany(Tag, {as: 'tags', through: models.TaggedPosts});

  await Tag.sync({});

  await models.TaggedPosts.sync({});

  return Tag;
};
