module.exports = `
<md-card class="group-item-card">
  <md-card-media v-if="group.coverImage" class="md-xsmall-hide">
    <content-manifest-item :manifest="group.coverImage" :preview-mode="true"></content-manifest-item>
  </md-card-media>

  <md-card-header @click.native="openGroup()">
    <div class="group-item-image md-xsmall-show">
      <content-manifest-item :manifest="group.avatarImage" :preview-mode="true"></content-manifest-item>
    </div>
    
    <div class="group-item-description">
      <div class="md-title">
        <router-link :to="{name: 'group-page', params: {groupId: idForRoute}}">{{group.title}}</router-link>
      </div>

      <div class="md-subhead">@{{group.name}}</div>
    </div>
  </md-card-header>

  <md-card-actions md-alignment="space-between" class="md-xsmall-hide">
    <md-button v-if="isCanEditGroup" :to="{'name': 'edit-group', params: {groupId: idForRoute}}">Edit</md-button>
    <div v-else-if="isJoined !== null">
      <md-button class="md-accent" v-if="isJoined" @click="leaveGroup">Unsubscribe</md-button>
      <md-button class="md-primary" v-else @click="joinGroup">Subscribe</md-button>
    </div>
  </md-card-actions>
</md-card>
`;