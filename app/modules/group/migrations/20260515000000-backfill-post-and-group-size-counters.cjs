'use strict';

/**
 * Database scalability review: restored post/group counter backfill.
 *
 * Production dump rehearsal with real group rows exposed old partial post
 * writes where PostsContents existed but Post.size stayed NULL, which also
 * left Group.size stale. Repair canonical DB counters from the attachment
 * join state so upgraded nodes do not show wrong group totals after the
 * BIGINT size rollout.
 */

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      WITH post_size_backfill AS (
        SELECT
          post.id,
          COALESCE(SUM(COALESCE(content.size, 0)), 0)::bigint AS size
        FROM posts post
        LEFT JOIN "postsContents" post_content
          ON post_content."postId" = post.id
        LEFT JOIN contents content
          ON content.id = post_content."contentId"
        GROUP BY post.id
      )
      UPDATE posts post
      SET size = backfill.size
      FROM post_size_backfill backfill
      WHERE post.id = backfill.id
        AND post.size IS DISTINCT FROM backfill.size
    `);

    await queryInterface.sequelize.query(`
      WITH group_counter_backfill AS (
        SELECT
          group_row.id,
          COALESCE(
            SUM(COALESCE(post.size, 0)) FILTER (
              WHERE post."isDeleted" IS FALSE
                AND post.status = 'published'
            ),
            0
          )::bigint AS size,
          COUNT(post.id) FILTER (
            WHERE post."isDeleted" IS FALSE
              AND post.status = 'published'
          )::integer AS available_posts_count,
          COALESCE(MAX(post."localId"), 0)::integer AS max_local_id
        FROM groups group_row
        LEFT JOIN posts post
          ON post."groupId" = group_row.id
        GROUP BY group_row.id
      )
      UPDATE groups group_row
      SET
        size = backfill.size,
        "availablePostsCount" = backfill.available_posts_count,
        "publishedPostsCount" = GREATEST(
          COALESCE(group_row."publishedPostsCount", 0),
          backfill.max_local_id
        )
      FROM group_counter_backfill backfill
      WHERE group_row.id = backfill.id
        AND (
          group_row.size IS DISTINCT FROM backfill.size
          OR COALESCE(group_row."availablePostsCount", 0) IS DISTINCT FROM backfill.available_posts_count
          OR COALESCE(group_row."publishedPostsCount", 0) < backfill.max_local_id
        )
    `);
  },

  down: async () => {
    // Data repair is intentionally not reversible.
  },
};
