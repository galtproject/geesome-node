module.exports = `
<div>
  <new-post-control v-if="group" :group="group" @new-post="getPosts()"></new-post-control>
  <div class="posts-list">
    <post-item v-for="(post, index) in posts" v-if="posts[index]" v-model="posts[index]" :group="group"></post-item>
  </div>
  <div class="posts-pagination" v-if="group">
    <pagination :total="group.postsCount" :per-page="perPage" :current-page.sync="currentPage"
                :display-pages="10"></pagination>
  </div>
</div>
`;