module.exports = `
<div id="joined-groups" class="container-page">
  <div class="md-layout">
    <div class="md-layout-item md-size-75 md-xsmall-size-100">
      <div class="md-title">
        <span>Followed groups</span>
        <md-button class="md-icon-button md-primary" :to="{name: 'content-page', query: { type: 'group'}}">
          <md-icon>add</md-icon>
        </md-button>
      </div>

      <div class="md-layout" style="margin-top: 20px;">
        <div class="md-layout-item md-size-30 md-xsmall-size-100" v-for="group in memberInGroups">
          <group-item :group="group" @change="getGroups()"></group-item>
        </div>
      </div>
    </div>
    <div class="md-layout-item md-size-25 md-xsmall-size-100">
      <div class="md-title">Recommend to follow</div>
    </div>
  </div>
</div>
`