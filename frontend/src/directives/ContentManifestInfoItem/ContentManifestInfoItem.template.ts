module.exports = `
<div :class="{'content-manifest-info-item': true, 'mini-manifest-info': mini}">
  <md-progress-bar class="md-accent" md-mode="indeterminate" v-if="loading"></md-progress-bar>

  <div class="md-layout" v-if="manifestObj" style="{'flex-direction': verticalMode ? 'row' : 'column'}">
    <div :class="{'md-layout-item': fullMode}">
      <div v-if="!fullMode"><b>Preview:</b></div>
      <content-manifest-item :manifest="manifestObj" :preview-mode="!fullMode"></content-manifest-item>
    </div>
    <div :class="{'md-layout-item': true, 'margin-top': verticalMode}"
         style="position: relative;">
      <div>
        <b>Name:</b>
        <pretty-name :name="manifestObj.name"></pretty-name>
        <br>
        <b>Type:</b> {{manifestObj.mimeType}}<br>
        <b>Size:</b> {{manifestObj.size| prettySize}}<br>
        <!--<b>Pins:</b> {{pins ? pins.length : '...'}}<br>-->
        <b>Ipfs hash:</b>
        <pretty-hex :hex="manifestObj.storageId"></pretty-hex>
        <br>
        <b>Preview ipfs hash:</b>
        <pretty-hex :hex="manifestObj.preview ? manifestObj.preview.medium.storageId : ''"></pretty-hex>
        <br>
        <b>Manifest ipld hash:</b>
        <pretty-hex :hex="manifestId" :to="{name: 'content-page', params: {manifestId}}"></pretty-hex>
        <br>
        <a class="icon-link" :href="srcLink" @click.prevent="download">
          <md-icon class="fas fa-file-download"></md-icon>
        </a>
        <router-link class="icon-link" :to="{name: 'content-page', params: {manifestId: manifestObj.id}}">
          <md-icon class="fas fa-share"></md-icon>
        </router-link>
      </div>
      <md-button v-if="showCloseButton" class="md-accent md-icon-button" @click="$emit('close')"
                 style="position: absolute; top: 0; right: 0;">
        <md-icon class="fas fa-times"></md-icon>
      </md-button>
    </div>
  </div>
</div>
`;