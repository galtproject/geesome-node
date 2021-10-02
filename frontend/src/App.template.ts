module.exports = `<div style="height: 100%;">
  <modal ref="modal"></modal>
  <modal ref="sub_modal"></modal>

  <!--<wait-screen></wait-screen>-->

  <notifications :duration="7000" position="bottom right"></notifications>
  <notifications :duration="7000" position="bottom right" group="loading" :max="1"></notifications>

  <div class="sk-cube-grid" v-if="loading">
    <div class="sk-cube sk-cube1"></div>
    <div class="sk-cube sk-cube2"></div>
    <div class="sk-cube sk-cube3"></div>
    <div class="sk-cube sk-cube4"></div>
    <div class="sk-cube sk-cube5"></div>
    <div class="sk-cube sk-cube6"></div>
    <div class="sk-cube sk-cube7"></div>
    <div class="sk-cube sk-cube8"></div>
    <div class="sk-cube sk-cube9"></div>
  </div>

  <md-app v-else>
    <md-app-drawer :md-permanent="is_mobile ? 'clipped' : 'full'" md-persistent="mini" :md-active.sync="menuVisible"
                   md-swipeable>

      <md-button @click="menuVisible = !menuVisible" class="md-icon-button md-xsmall-hide menu-button">
        <md-icon class="fas fa-bars"></md-icon>
      </md-button>

      <!--<md-button @click="menuVisible = !menuVisible" class="md-icon-button md-xsmall-show close-button">-->
        <!--<md-icon class="fas fa-times"></md-icon>-->
      <!--</md-button>-->

      <div class="md-xsmall-show drawer-header">
        
        <div class="profile" v-if="user">
          <div class="avatar">
            <div v-if="user.avatarImage">
              <content-manifest-item :manifest="user.avatarImage.manifestStorageId" :preview-mode="true"></content-manifest-item>
            </div>
            <img v-else src="${require('../assets/empty-profile.png')}">
          </div>
          <div class="info">
            <div class="profile-name"><b>{{user.title || '@' + user.name}}</b></div>
            <div class="profile-id"><pretty-hex :hex="user.storageAccountId"></pretty-hex></div>
          </div>
        </div>
        
        <div class="server">
          <div v-locale="localeKey + '.server_address'"></div>
          <small>{{serverAddress}}</small>

          <div>
            <a v-if="user" href @click.prevent.stop="logout()">Logout</a>
            <router-link v-else :to="{name: 'login'}">Login</router-link>
          </div>
        </div>
      </div>

      <!--<div class="drawer-header md-layout">-->
      <!--<div class="md-layout-item md-xsmall-size-40">-->
      <!--<div class="logo">-->
      <!--<img src="build/images/logo.png">-->
      <!--</div>-->
      <!--</div>-->
      <!--</div>-->

      <!--<span class="logo"><img src="assets/logo-circle-only.png"></span>-->

      <div class="drawer-content">
        <main-menu :menu-visible.sync="menuVisible" :menu-minimized.sync="menuMinimized"></main-menu>
      </div>
    </md-app-drawer>

    <md-app-content>
      <md-app-toolbar class="md-accent" md-elevation="0">
        <div class="md-toolbar-row">
          <md-button @click="menuVisible = !menuVisible" class="md-icon-button md-xsmall-show">
            <md-icon class="fas fa-bars"></md-icon>
          </md-button>

          <span class="logo"><img src="${require('../assets/logo-circle-only.png')}"></span>

          <h3 class="md-title" v-locale="localeKey + '.navbar_title'"></h3>
          <span style="margin-left: 5px;"><h5>v{{version}}</h5></span>

          <span flex style="flex: 1"></span>

          <span class="md-xsmall-hide">
            <div v-locale="localeKey + '.server_address'"></div>
            <small>{{serverAddress}}</small>
            
            <div>
              <a v-if="user" href @click.prevent="logout()">Logout</a>
              <router-link v-else :to="{name: 'login'}">Login</router-link>
            </div>
          </span>
        </div>
      </md-app-toolbar>

      <md-progress-bar class="md-accent" md-mode="indeterminate" v-if="loading"
                       style="margin-top: 100px;"></md-progress-bar>

      <router-view v-if="!loading"></router-view>

      <move-file-catalog-item-container></move-file-catalog-item-container>
    </md-app-content>
  </md-app>
</div>
`;