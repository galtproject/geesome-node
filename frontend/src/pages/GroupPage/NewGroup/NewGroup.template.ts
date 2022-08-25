module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
      <md-card>
        <md-card-header>
          <div class="md-title">New Group</div>
        </md-card-header>

        <md-card-content>

          <group-form :group.sync="group" :invalid.sync="invalidInputs"></group-form>

          <div>
            <md-button class="md-raised md-accent" @click="create()" :disabled="invalidInputs || sending">
              Create
            </md-button>
          </div>

          <div style="margin-top: 20px" class="md-error" v-if="error">Creation failed, please check fields for further
            data
          </div>
        </md-card-content>
      </md-card>
    </div>
    <div class="md-layout-item md-size-50 md-xsmall-size-100 faq-block">
      <p>You can use Geesome Groups as:</p>
      <ul class="new-group-features-list">
        <li>
          <md-icon class="fas fa-bullhorn"></md-icon>
          <span>Public page (like in Instagram, Telegram, Twitter or Youtube)</span>
        </li>
        <li>
          <md-icon class="fas fa-bookmark"></md-icon>
          <span>Private channel (like Saved messages in Telegram or favorites in Instagram)</span>
        </li>
        <li>
          <md-icon class="fas fa-sticky-note"></md-icon>
          <span>Notebook (like Evernote)</span>
        </li>
        <li>
          <md-icon class="fas fa-comments"></md-icon>
          <span>Public or private chat</span>
        </li>
        <li>
          <md-icon class="fas fa-music"></md-icon>
          <span>Audio or video list (like Audio in Vkontakte or Youtube playlist)</span>
        </li>
      </ul>
    </div>
  </div>
</posts-container>
`;