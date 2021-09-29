module.exports = `
<posts-container :mode="'tight'">
  <md-card>
    <md-card-header>
      <div class="md-title">Authorization</div>
    </md-card-header>

    <md-card-content>

      <md-tabs class="simple-tabs">
        <md-tab md-label="Login, password" id="login-password">
          <md-field>
            <label>Geesome node</label>
            <md-input v-model="server"></md-input>
          </md-field>

          <md-field>
            <label>Login</label>
            <md-input v-model="username"></md-input>
          </md-field>

          <md-field>
            <label>Password</label>
            <md-input v-model="password" type="password"></md-input>
          </md-field>

          <md-button class="md-primary" @click="login('password')">
            Login
          </md-button>
        </md-tab>
        <md-tab md-label="Api key" id="api-key">

          <md-field>
            <label>Geesome node</label>
            <md-input v-model="server"></md-input>
          </md-field>

          <md-field>
            <label>Api key</label>
            <md-input v-model="apiKey"></md-input>
          </md-field>

          <md-button class="md-primary" @click="login('api-key')">
            Login
          </md-button>
        </md-tab>
      </md-tabs>

      <div style="margin-top: 20px;">
        <md-button class="md-icon-button md-raised md-accent" @click="ethereumLogin"><md-icon class="fab fa-ethereum"></md-icon></md-button>
      </div>

      <div style="margin-top: 20px" class="md-error" v-if="error">Authorization failed, please try again</div>
    </md-card-content>
  </md-card>
</posts-container>
`;