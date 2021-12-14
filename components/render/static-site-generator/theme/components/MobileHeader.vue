<template>
  <div id="mobile-header">
    <div class="mobile-header-bar">
      <div class="mobile-header-title">
        <nav-link link="/" class="mobile-home-link">{{ $site.title }} </nav-link>
<!--        <XIcon v-if="isOpen" @click="$emit('toggle-sidebar')"></XIcon>-->
<!--        <MenuIcon v-else @click="$emit('toggle-sidebar')"></MenuIcon>-->
      </div>
      <div class="mobile-menu-wrapper" :class="{ open: isOpen }">
        <hr class="menu-divider" />
        <ul v-if="$themeConfig.nav" class="mobile-nav">
          <li
              v-for="item in $themeConfig.nav"
              :key="item.text"
              class="mobile-nav-item"
          >
            <nav-link :link="item.link">{{ item.text }}</nav-link>
          </li>
          <li class="mobile-nav-item">
            <Feed />
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import {usePageData} from "@vuepress/client";
const page = usePageData();

import Feed from './Feed.vue'
import NavLink from "./NavLink.vue";
export default {
  components: {
    Feed,
    NavLink,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  computed: {
    $themeConfig() {
      return page._value.$themeConfig;
    }
  }
}
</script>