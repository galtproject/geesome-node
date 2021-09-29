module.exports = `
<div v-if="canCreatePosts">
  <md-card class="new-post-card">
    <md-card-header>
      <div class="md-subhead" v-locale="localeKey + '.new_post'"></div>
    </md-card-header>

    <md-card-content v-for="(id, index) in postContentsDbIds" class="contents-list">
      <content-manifest-info-item :db-id="id" @close="deleteContent(index)" :mini="true"></content-manifest-info-item>
    </md-card-content>

    <md-card-content class="publish-post-container" v-if="postContentsDbIds.length">
      <md-button class="md-raised md-accent" @click="publishPost()" :disabled="saving">
        <md-icon class="fas fa-save"></md-icon>
        Publish post
      </md-button>
    </md-card-content>

    <md-card-content v-if="postContentsDbIds.length">
      <div class="md-subhead">Attach more to post:</div>
    </md-card-content>

    <md-card-content v-if="saving">
      <md-progress-bar class="md-accent" md-mode="indeterminate"></md-progress-bar>
    </md-card-content>

    <md-card-content>
      <upload-content @uploaded="handleUpload" :group-id="group.id"></upload-content>
    </md-card-content>
  </md-card>
</div>
`;