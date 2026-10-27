'use strict';
module.exports = {
  up: async queryInterface => {
    const columns = await queryInterface.describeTable('postsContents');
    if (columns.isPrivate) {
      return;
    }
    await queryInterface.sequelize.transaction(async transaction => {
      await queryInterface.sequelize.query('ALTER TABLE "postsContents" ADD COLUMN "isPrivate" boolean NOT NULL DEFAULT false', {transaction});
      // Existing private groups must not expose all their attachments when first
      // generating a public projection. Authors explicitly select public items.
      await queryInterface.sequelize.query(`UPDATE "postsContents" AS attachment
        SET "isPrivate" = true FROM posts AS post JOIN groups AS source ON source.id = post."groupId"
        WHERE attachment."postId" = post.id AND source."isPublic" = false`, {transaction});
    });
  },
  down: async queryInterface => {
    await queryInterface.removeColumn('postsContents', 'isPrivate');
  }
};
