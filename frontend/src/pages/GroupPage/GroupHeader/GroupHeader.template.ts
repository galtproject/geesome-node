module.exports = `
<div :style="{'background-image': 'url(' + coverImageSrc + ')'}" class="group-header" v-if="group">
  <div class="group-header-title" style="margin-bottom: 100px;">{{group.title}}</div>
  <!--<div class="group-header-avatar"><img :src="avatarImage"></div>-->
</div>
`;