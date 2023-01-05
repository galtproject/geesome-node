module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
      <md-card>
        <md-card-header>
          <div class="md-title">Setup GeeSome Node</div>
        </md-card-header>

        <md-card-content>

          <md-field>
            <label>Admin email</label>
            <md-input v-model="setupData.email"></md-input>
          </md-field>

          <md-field>
            <label>Admin username</label>
            <md-input v-model="setupData.name"></md-input>
          </md-field>

          <md-field>
            <label>Admin password</label>
            <md-input v-model="setupData.password" type="password"></md-input>
          </md-field>

          <md-field>
            <label>Repeat admin password</label>
            <md-input v-model="setupData.repeatPassword" type="password"></md-input>
          </md-field>

          <div>
            <md-button class="md-raised md-accent" @click="setup()" :disabled="invalidInputs || sending">
              Submit
            </md-button>
          </div>

          <div style="margin-top: 20px" class="md-error" v-if="error">Setup failed, maybe setup already done.</div>
        </md-card-content>
      </md-card>
    </div>
    
    <div class="md-layout-item md-size-50 md-xsmall-size-100 faq-block">
      <p>You can use Geesome for:</p>
      <ul class="new-group-features-list">
        <li>
          <md-icon class="fas fa-hdd"></md-icon>
          <span>Personal file storage</span>
        </li>
        <li>
          <md-icon class="fas fa-sticky-note"></md-icon>
          <span>Personal blog (like Tumblr) or notebook (like Evernote)</span>
        </li>
        <li>
          <md-icon class="fas fa-comments"></md-icon>
          <span>Personal chat node for communication with other nodes</span>
        </li>
        <li>
          <md-icon class="fas fa-music"></md-icon>
          <span>Personal media platform for audio or video lists (like Audio in Vkontakte or Youtube playlist)</span>
        </li>
        <li>
          <md-icon class="fas fa-user-friends"></md-icon>
          <span>Sharing all this features for friends by adding they as users</span>
        </li>
      </ul>
    </div>
  </div>
</posts-container>
`;