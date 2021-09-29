module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
      <md-card>
        <md-card-header>
          <div class="md-title">New User</div>
        </md-card-header>

        <md-card-content>

          <md-field>
            <label>@Username</label>
            <md-input v-model="user.name" :disabled="creation"></md-input>
          </md-field>

          <!--<md-field>-->
          <!--<label>Email</label>-->
          <!--<md-input v-model="user.email" :disabled="creation"></md-input>-->
          <!--</md-field>-->

          <md-field>
            <label>Key store method</label>
            <md-select v-model="user.keyStoreMethod" :disabled="true">
              <md-option value="local">Local (in extension)</md-option>
              <md-option value="node">In node</md-option>
            </md-select>
          </md-field>

          <md-switch v-model="passwordAuth">
            <span v-if="passwordAuth">Password auth</span>
            <span v-else>Auth by api key</span>
          </md-switch>

          <md-field v-if="passwordAuth">
            <label>Password</label>
            <md-input v-model="user.password" :disabled="creation"></md-input>
          </md-field>

          <div class="md-warn" style="margin-bottom: 10px;" v-else>You can share api key for simple authorization to
            node. You will receive api key after user creation.
          </div>

          <md-field>
            <label>Ethereum address for auth</label>
            <md-input v-model="user.ethereumAddress" :disabled="creation"></md-input>
          </md-field>

          <div>
            <div class="md-subhead">User limits</div>

            <md-checkbox v-model="userLimit.isActive" :disabled="creation">Limit for save content</md-checkbox>

            <div class="md-layout" v-if="userLimit.isActive">
              <div class="md-layout-item md-size-40">
                <md-field>
                  <label>Size, Mb</label>
                  <md-input v-model="userLimit.valueMb" type="number" :disabled="creation"></md-input>
                </md-field>
              </div>
              <div class="md-layout-item md-size-5"></div>
              <div class="md-layout-item md-size-50">
                <period-input :locale-label="localeKey + '.limit_period'" v-model="userLimit.periodTimestamp"
                              :disabled="creation"></period-input>
              </div>
            </div>
          </div>

          <div>
            <md-checkbox v-model="isAdmin" :disabled="creation">Admin user</md-checkbox>
          </div>

          <div>
            <md-checkbox v-model="isOnlySaveData" :disabled="creation">Access only for content saving</md-checkbox>
          </div>

          <md-button class="md-raised md-accent" @click="create()" :disabled="creation || creationDisabled">Create
            user
          </md-button>

          <div style="margin-top: 20px" class="md-success" v-if="created">User successfully created!</div>
          <div style="margin-top: 20px" class="md-success" v-if="resultApiKey">User api key:
            <pretty-hex :hex="resultApiKey" :full="true"></pretty-hex>
          </div>

          <div style="margin-top: 20px" class="md-error" v-if="error">Creation failed: {{error}}</div>
        </md-card-content>
      </md-card>
    </div>

    <div class="md-layout-item md-size-50 md-xsmall-size-100 faq-block">
      <p>You can create Geesome Users for:</p>
      <ul class="new-group-features-list">
        <li>
          <md-icon class="fas fa-user-plus"></md-icon>
          <span>Invite friends, so they can create their own groups, make posts, uploading and sharing content, etc.</span>
        </li>
        <li>
          <md-icon class="fas fa-robot"></md-icon>
          <span>Make bots for interaction via API: create groups, make posts, uploading and sharing content, etc.</span>
        </li>
        <li>
          <md-icon class="fas fa-hdd"></md-icon>
          <span>Bind to another node for additional storage space</span>
        </li>
      </ul>
    </div>
  </div>
</posts-container>
`;