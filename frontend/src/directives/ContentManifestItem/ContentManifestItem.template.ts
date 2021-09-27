module.exports = `
<content>
  <img v-if="resultType === 'image' && previewMode" :src="content">
  <a v-if="resultType === 'image' && !previewMode" href @click.prevent="openImage"><img :src="content"></a>

  <media-element v-if="resultType === 'video' && content" :source="content" :preview="previewSrcLink"></media-element>
  <span v-if="resultType === 'text' && content" v-html="content"></span>

  <div class="md-layout" v-if="resultType === 'file'" style="align-items: center;">
    <div :class="{'md-layout-item': true, 'md-size-10': !previewMode, 'md-size-100': previewMode}"
         :style="{'text-align': previewMode ? 'center' : 'left'}">
      <md-button class="md-icon-button" @click="download()">
        <md-icon class="fas fa-file-download fa-3x"></md-icon>
      </md-button>
    </div>
    <div :class="{'md-layout-item': true, 'md-size-90': !previewMode, 'md-size-100': previewMode}"
         :style="{'text-align': previewMode ? 'center' : 'left'}" v-if="manifestObj">
      <a href @click.prevent="download">
        <pretty-name :name="manifestObj.name"></pretty-name>
      </a>
    </div>
  </div>
</content>
`;