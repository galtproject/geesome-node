<template>
  <div>404 Not Found!</div>
</template>

<script>
import {usePageData} from "@vuepress/client";
const page = usePageData();
// import Footer from './components/Footer.vue'
export default {
  components: {
    // DefaultGlobalLayout: GlobalLayout,
    // Header,
    // MobileHeader,
    // Footer,
  },
  data() {
    return {
      isMobileHeaderOpen: false,
    }
  },
  computed: {
    $site() {
      return page._value.$site;
    },
  },
}
</script>