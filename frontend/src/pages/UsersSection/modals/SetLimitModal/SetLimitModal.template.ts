module.exports = `
<modal-item class="large-modal">
  <template slot="header">
    <md-button class="md-icon-button close" @click="cancel">
      <md-icon>clear</md-icon>
    </md-button>
    <h4>
      <div class="modal-title">Limit for save content</div>
    </h4>
  </template>

  <div class="modal-body" slot="body">
    <md-checkbox v-model="userLimit.isActive" :disabled="saving">Active</md-checkbox>

    <div class="md-layout" v-if="userLimit.isActive">
      <div class="md-layout-item md-size-40">
        <md-field>
          <label>Size, Mb</label>
          <md-input v-model="userLimit.valueMb" type="number" :disabled="saving"></md-input>
        </md-field>
      </div>
      <div class="md-layout-item md-size-5"></div>
      <div class="md-layout-item md-size-50">
        <period-input :locale-label="localeKey + '.limit_period'" v-model="userLimit.periodTimestamp"
                      :disabled="saving"></period-input>
      </div>
    </div>
  </div>

  <template slot="footer">
    <md-button @click="cancel" class="md-raised"><span>Close</span></md-button>
    <md-button @click="ok" class="md-raised md-accent" :disabled="saving">Ok</md-button>
  </template>
</modal-item>
`;