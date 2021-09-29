module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Add friend</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <p>
      You have to ask friend for his IPNS or IPLD hash of profile to start messaging with him.
    </p>

    <md-field>
      <label>Friend's IPNS or IPLD</label>
      <md-input v-model="friendId"></md-input>
    </md-field>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Cancel</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="!friendId">Ok</md-button>
  </template>
</modal-item>
`;