module.exports = `
<div>
  <md-card>
    <md-card-header>
      <div class="md-title">Welcome to Geesome!</div>
    </md-card-header>

    <md-card-content>
      <p>Here you can publish content, make public pages (like in social networks), invite and share to friends!</p>
    </md-card-content>

    <md-card-content>
      <md-subheader>Read access</md-subheader>

      <div class="md-layout" style="margin-bottom: 25px;">
        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" :to="{name: 'content-page', query: {type: 'group'}}">
            <md-icon class="fas fa-bullhorn"></md-icon>
            <div style="text-align: center;">Join to<br>group/channel</div>
          </md-button>
        </div>

        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" :to="{name: 'content-page'}">
            <md-icon class="fas fa-eye"></md-icon>
            <div>View content</div>
          </md-button>
        </div>

        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" @click="connectToNode">
            <md-icon class="fas fa-sign-in-alt"></md-icon>
            <div style="text-align: center;">Connect to<br>Geesome node</div>
          </md-button>
        </div>
      </div>

      <md-subheader>Write access</md-subheader>

      <div class="md-warn" v-if="!user" style="margin-left: 15px;">To get write access - you need to <b>
        <router-link :to="{'name': 'login'}">login</router-link>
      </b> to Geesome node.
      </div>

      <div class="md-layout">
        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" :to="{name: 'new-group'}" :disabled="!user">
            <md-icon class="fas fa-users-cog"></md-icon>
            <div>Create public page</div>
          </md-button>
        </div>

        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" :to="{name: 'new-user-invite'}" :disabled="!user">
            <md-icon class="fas fa-user-plus"></md-icon>
            <div>Add users</div>
          </md-button>
        </div>

        <div class="md-layout-item md-size-30 md-xsmall-size-50" style="padding: 5px;">
          <md-button class="md-raised huge-button md-accent" :to="{name: 'file-explorer'}" :disabled="!user">
            <md-icon class="fas fa-upload"></md-icon>
            <div>Upload content</div>
          </md-button>
        </div>
      </div>
    </md-card-content>
  </md-card>
</div>
`;