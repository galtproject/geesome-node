module.exports = `
<div :class="{'message': true, 'my': isCurrentUserMessage}">
  <div class="avatar">
    <content-manifest-item v-if="usersInfo[message.authorStaticId]" :manifest="usersInfo[message.authorStaticId].avatarImage" :preview-mode="true"></content-manifest-item>
  </div>
  <div class="info">
    <div class="name" v-if="!isCurrentUserMessage && usersInfo[message.authorStaticId]">{{usersInfo[message.authorStaticId] ? usersInfo[message.authorStaticId].title || usersInfo[message.authorStaticId].name : '...'}}</div>
    <!--<pretty-hex :hex="message.author"></pretty-hex>-->
    <div class="content">
      <md-card-content v-for="content in contentsList">
        <content-manifest-item :manifest="content"></content-manifest-item>
      </md-card-content>
    </div>
  </div>
  <div class="date">{{date}}</div>
</div>
`;