module.exports = `
<posts-container :mode="'wide'">
  <div class="md-layout">
    <div class="md-layout-item md-size-50 md-xsmall-size-100">
      <md-card>
        <md-card-header>
          <div class="md-title">Edit User Password</div>
        </md-card-header>

        <md-card-content>

		  <md-field>
			<label>Password</label>
			<md-input v-model="user.password" type="password"></md-input>
		  </md-field>

		  <md-field>
			<label>Password confirm</label>
			<md-input v-model="user.passwordConfirm" type="password"></md-input>
		  </md-field>

          <div>
            <md-button class="md-raised md-accent" @click="update()" :disabled="!passwordsMatch || sending">
              Update
            </md-button>
          </div>

          <div style="margin-top: 20px" class="md-error" v-if="error">
          	Creation failed, please check fields for further data
          </div>
        </md-card-content>
      </md-card>
    </div>
  </div>
</posts-container>
`;