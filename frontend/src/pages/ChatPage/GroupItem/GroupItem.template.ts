module.exports = `
<router-link :class="{'group': true, 'active': active}" :to="to">
    <div class="avatar">
        <content-manifest-item :manifest="avatarImage" :preview-mode="true"></content-manifest-item>
    </div>
    <div class="info">
        <div class="name"><span>{{title}}</span></div> 
        <!--<pretty-hex :hex="group.ipns"></pretty-hex>-->
        <div class="text" v-html="lastMessageText"></div>
    </div>
    <div class="date">{{group.updatedAt | prettyDate}}</div>
</router-link>
`;