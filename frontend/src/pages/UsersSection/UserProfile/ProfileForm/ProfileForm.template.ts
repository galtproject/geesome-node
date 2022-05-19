module.exports = `
<div v-if="user">
  <md-field>
    <label>@Username</label>
    <md-input v-model="user.name"></md-input>
  </md-field>

  <md-field>
    <label>FullName</label>
    <md-input v-model="user.title"></md-input>
  </md-field>

  <md-field>
    <label>Ethereum Address</label>
    <md-input v-model="user.foreignAccounts.ethereum.address"></md-input>
  </md-field>

  <md-field>
    <label>Description</label>
    <md-textarea v-model="user.description"></md-textarea>
  </md-field>

  <div class="md-layout" style="margin: 15px 0;">
    <div class="md-layout-item md-size-50" v-if="user.avatarImageId">
      <content-manifest-item :db-id="user.avatarImageId" :vertical-mode="true"></content-manifest-item>
    </div>
    <div class="md-layout-item md-size-50">
      <md-button class="md-primary" @click="chooseImage('avatarImageId')">Set avatar image</md-button>
    </div>
  </div>
</div>
`;