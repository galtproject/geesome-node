<template>
  <section id="header-wrapper">
    <header id="header">
      <div class="header-wrapper">
        <div class="title">
          <NavLink link="/" class="home-link">{{ $site.title }} </NavLink>
        </div>
        <div class="header-right-wrap">
          <ul v-if="$themeConfig.nav" class="nav">
            <li
                v-for="item in $themeConfig.nav"
                :key="item.text"
                class="nav-item"
            >
              <nav-link :link="item.link">{{ item.text }}</nav-link>
            </li>
          </ul>
<!--          <SearchBox />-->
          <Feed />
        </div>
      </div>
    </header>
  </section>
</template>

<script>
// import SearchBox from '@SearchBox';
import Feed from './Feed';
import NavLink from './NavLink';
import {usePageData} from "@vuepress/client";
const page = usePageData();
export default {
  components: { Feed, NavLink },
  computed: {
    $site() {
      return page._value.$site;
    },
    $themeConfig() {
      return page._value.$themeConfig;
    }
  }
}
</script>
