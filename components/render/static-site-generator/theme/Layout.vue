<template>
  <div id="vuepress-theme-blog__global-layout">
    <Header />
    <MobileHeader
        :is-open="isMobileHeaderOpen"
        @toggle-sidebar="isMobileHeaderOpen = !isMobileHeaderOpen"
    />
    <div class="content-wrapper" @click="isMobileHeaderOpen = false">
      <slot name="page"/>
    </div>
<!--    <Footer />-->
  </div>
</template>

<script>
  // import GlobalLayout from '@app/components/GlobalLayout.vue'
  import Header from './components/Header.vue'
  import MobileHeader from './components/MobileHeader.vue'
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
    mounted() {
      this.$router.afterEach(() => {
        this.isMobileHeaderOpen = false
      })
    },
  }
</script>

<style lang="scss" src="./styles/index.scss"></style>