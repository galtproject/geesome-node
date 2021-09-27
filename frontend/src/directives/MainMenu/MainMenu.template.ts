module.exports = `
<content>

  <!--<md-toolbar class="md-transparent md-xsmall-hide" md-elevation="0">-->
    <!--<span v-if="menuVisibleLocal" v-locale="localeKey + '.title'"></span>-->
  <!--</md-toolbar>-->

  <md-list>
    <md-list-item :to="'/'">
      <md-icon class="fas fa-home"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.home'"></span>
    </md-list-item>
    
    <md-list-item :to="{name: 'current-user-profile'}" v-if="user">
      <md-icon class="fas fa-user"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.profile'"></span>
    </md-list-item>

    <md-list-item :to="{name: 'chat-page'}" v-if="user">
      <md-icon class="fas fa-comments"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.chat'"></span>
    </md-list-item>

    <md-list-item :to="{name: 'file-explorer'}" v-if="user">
      <md-icon class="fas fa-hdd"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.file_explorer'"></span>
    </md-list-item>

    <md-list-item :to="{name: 'boot-nodes'}" v-if="haveAdminReadPermission">
      <md-icon class="fas fa-server"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.boot_nodes'"></span>
    </md-list-item>

    <md-list-item :to="{name: 'admined-groups'}" v-if="user">
      <md-icon class="fas fa-users-cog"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.administration_groups'"></span>
    </md-list-item>

    <md-divider class="md-inset"></md-divider>

    <md-list-item v-for="group in adminInGroups" :to="{name: 'group-page', params: { groupId: group.staticId }}">
      <md-avatar>
        <content-manifest-item v-if="group.avatarImage" :manifest="group.avatarImage"
                               :preview-mode="true"></content-manifest-item>
        <span v-else>{{group.title.slice(0, 2)}}</span>
      </md-avatar>

      <span class="md-list-item-text">{{group.title}}</span>

      <md-button class="md-icon-button md-list-action">
        <md-icon class="md-primary fas fa-th-list"></md-icon>
      </md-button>
    </md-list-item>

    <md-divider class="md-inset"></md-divider>

    <md-list-item :to="{name: 'joined-groups'}">
      <md-icon class="fas fa-user-friends"></md-icon>
      <span class="md-list-item-text" v-locale="localeKey + '.followed_groups'"></span>
    </md-list-item>

    <md-divider class="md-inset"></md-divider>

    <md-list-item v-for="group in memberInGroups" :to="{name: 'group-page', params: { groupId: group.staticId }}">
      <md-avatar>
        <content-manifest-item v-if="group.avatarImage" :manifest="group.avatarImage"
                               :preview-mode="true"></content-manifest-item>
        <span v-else>{{group.title.slice(0, 2)}}</span>
      </md-avatar>

      <span class="md-list-item-text">{{group.title}}</span>

      <md-button class="md-icon-button md-list-action">
        <md-icon class="md-primary fas fa-th-list"></md-icon>
      </md-button>
    </md-list-item>
  </md-list>
</content>   
`;