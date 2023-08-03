module.exports = `
<div v-if="group">
  <md-field>
    <label>Username</label>
    <md-input v-model="group.name"></md-input>
  </md-field>

  <md-field>
    <label>Title</label>
    <md-input v-model="group.title"></md-input>
  </md-field>

  <md-field>
    <label>Type</label>
    <md-select v-model="group.type">
      <md-option value="channel">Channel</md-option>
      <md-option value="chat">Chat</md-option>
    </md-select>
  </md-field>

  <md-field>
    <label>View</label>
    <md-select v-model="group.view">
      <md-option value="tumblr-like">Like in Tumblr</md-option>
      <md-option value="youtube-like">Like in Youtube</md-option>
      <md-option value="instagram-like">Like in Instagram</md-option>
      <md-option value="evernote-like">Like in Evernote</md-option>
    </md-select>
  </md-field>

  <md-checkbox v-model="group.isPublic">Public group</md-checkbox>

  <div class="md-layout" style="margin: 15px 0;">
    <div class="md-layout-item md-size-50" v-if="group.avatarImageId">
      <content-manifest-item :db-id="group.avatarImageId" :vertical-mode="true"></content-manifest-item>
    </div>
    <div class="md-layout-item md-size-50">
      <md-button class="md-primary" @click="chooseImage('avatarImageId')">Set avatar image</md-button>
    </div>
  </div>

  <div class="md-layout" style="margin: 15px 0;">
    <div class="md-layout-item md-size-50" v-if="group.coverImageId">
      <content-manifest-item :db-id="group.coverImageId" :vertical-mode="true"></content-manifest-item>
    </div>
    <div class="md-layout-item md-size-50">
      <md-button class="md-primary" @click="chooseImage('coverImageId')">Set cover image</md-button>
    </div>
  </div>
</div>
`;