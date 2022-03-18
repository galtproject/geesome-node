<template>
  <div id="vuepress-theme-blog__global-layout">
<!--    <Header />-->
<!--    <MobileHeader-->
<!--        :is-open=avatarUrl"isMobileHeaderOpen"-->
<!--        @toggle-sidebar="isMobileHeaderOpen = !isMobileHeaderOpen"-->
<!--    />-->

    <div class="content-wrapper" @click="isMobileHeaderOpen = false">
      <div class="content-info">
        <div class="site-info">
          <div class="avatar-row">
            <div class="avatar"><img :src="$site.avatarUrl"></div>
            <div class="title">
              <div class="main-title">{{$site.title}}</div>
              <div class="sub-title">Posts: {{$site.postsCount}}</div>
            </div>
          </div>
          <div class="description-row">{{$site.description}}</div>
        </div>
      </div>
      <div class="content-data">
        <div class="tabs">
          <a :href="$site.base" target="_self">Latest posts</a>
        </div>
        <slot name="page"/>
      </div>
    </div>
<!--    <Footer />-->
  </div>
</template>

<script>
  // import GlobalLayout from '@app/components/GlobalLayout.vue'
  import Header from './components/Header.vue'
  import MobileHeader from './components/MobileHeader.vue'
  import {usePageData} from "@vuepress/client";
  const page = usePageData();
  // import Footer from './components/Footer.vue'
  export default {
    components: {
      // DefaultGlobalLayout: GlobalLayout,
      Header,
      MobileHeader,
      // Footer,
    },
    data() {
      return {
        isMobileHeaderOpen: false,
      }
    },
    computed: {
      $site() {
        console.log('page', page);
        return page._value.$site;
      },
    },
    mounted() {
      this.$router.afterEach(() => {
        this.isMobileHeaderOpen = false
      })
    },
  }
</script>

<style lang="scss" src="./styles/index.scss"></style>