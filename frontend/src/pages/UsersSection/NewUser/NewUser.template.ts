module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
	  <md-tabs md-sync-route class="margin-top">
		<md-tab id="new-user-invite" md-label="Invite" :to="{name: 'new-user-invite'}"></md-tab>
		<md-tab id="new-user-register" md-label="Register" :to="{name: 'new-user-register'}"></md-tab>
	  </md-tabs>
	  
      <md-card>
        <md-card-content>
		  <router-view></router-view>
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