module.exports = `<div>
  <div>
	<div class="md-layout">
	  <div class="md-layout-item md-size-30">
		<md-field>
		  <label>Max count to invite</label>
		  <md-input v-model="invite.maxCount" type="number" :disabled="creation"></md-input>
		</md-field>
	  </div>
	  <div class="md-layout-item md-size-5"></div>
	  <div class="md-layout-item md-size-60">
		<md-field>
		  <label>Title(optional)</label>
		  <md-input v-model="invite.title" :disabled="creation"></md-input>
		</md-field>
	  </div>
	</div>
	
	<div class="md-subhead">Invite limits for each user</div>

	<md-checkbox v-model="inviteLimit.isActive" :disabled="creation">Limit for save content</md-checkbox>

	<div class="md-layout" v-if="inviteLimit.isActive">
	  <div class="md-layout-item md-size-40">
		<md-field>
		  <label>Size, Mb</label>
		  <md-input v-model="inviteLimit.valueMb" type="number" :disabled="creation"></md-input>
		</md-field>
	  </div>
	  <div class="md-layout-item md-size-5"></div>
	  <div class="md-layout-item md-size-50">
		<period-input :locale-label="localeKey + '.limit_period'" v-model="inviteLimit.periodTimestamp"
					  :disabled="creation"></period-input>
	  </div>
	</div>
  </div>

  <div>
	<div class="md-subhead">Permissions for each user</div>
	<div>
		<md-checkbox v-model="isAdmin" :disabled="creation">Admin user</md-checkbox>
	</div>
	
	<div>
		<md-checkbox v-model="isOnlySaveData" :disabled="creation">Access only for content saving</md-checkbox>
	</div>
  </div>

  <md-button class="md-raised md-accent" @click="create()" :disabled="creation || creationDisabled">
  	Create invite
  </md-button>

  <div style="margin-top: 20px" class="md-success" v-if="created">Invite successfully created! Link: <pretty-hex :to="{name: 'join-by-invite', params: {code: invite.code}}" :hex="inviteUrl" :full="1">{{inviteUrl}}</pretty-hex></div>

  <div style="margin-top: 20px" class="md-error" v-if="error">Creation failed: {{error}}</div>
</div>
`;