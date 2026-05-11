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

  const PostEvent = sequelize.define('postEvent', {
    type: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    source: {
      type: DataTypes.STRING(200)
    },
    sourceChannelId: {
      type: DataTypes.STRING(200)
    },
    sourcePostId: {
      type: DataTypes.STRING(200)
    },
    sourceDate: {
      type: DataTypes.DATE
    },
    previousStatus: {
      type: DataTypes.STRING(200)
    },
    nextStatus: {
      type: DataTypes.STRING(200)
    },
    previousIsDeleted: {
      type: DataTypes.BOOLEAN
    },
    nextIsDeleted: {
      type: DataTypes.BOOLEAN
    },
    payloadJson: {
      type: DataTypes.TEXT
    }
  } as any, {
    indexes: [
      { name: 'post_events_post_created_idx', fields: ['postId', 'createdAt', 'id'] },
      { name: 'post_events_group_created_idx', fields: ['groupId', 'createdAt', 'id'] },
      { name: 'post_events_source_identity_idx', fields: ['groupId', 'source', 'sourceChannelId', 'sourcePostId', 'createdAt', 'id'] },
      { name: 'post_events_type_action_created_idx', fields: ['type', 'action', 'createdAt', 'id'] }
    ]
  } as any);

  PostEvent.belongsTo(models.Post, {as: 'post', foreignKey: 'postId'});
  models.Post.hasMany(PostEvent, {as: 'events', foreignKey: 'postId'});

  PostEvent.belongsTo(models.Group, {as: 'group', foreignKey: 'groupId'});
  models.Group.hasMany(PostEvent, {as: 'postEvents', foreignKey: 'groupId'});

  PostEvent.belongsTo(models.User, {as: 'user', foreignKey: 'userId'});
  models.User.hasMany(PostEvent, {as: 'postEvents', foreignKey: 'userId'});

  return PostEvent.sync({});
};
