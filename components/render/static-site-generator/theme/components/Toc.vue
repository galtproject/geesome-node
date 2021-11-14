<template>
  <Sticker v-if="visible" class="vuepress-toc" v-bind="$attrs">
    <div
        v-for="(item, index) in $page.headers"
        ref="chairTocItem"
        :key="index"
        class="vuepress-toc-item"
        :class="[
        `vuepress-toc-h${item.level}`,
        { active: activeIndex === index },
      ]"
    >
      <a :href="`#${item.slug}`" :title="item.title">{{ item.title }}</a>
    </div>
  </Sticker>
</template>

<script>
  import {usePageData} from "@vuepress/client";
  const page = usePageData();
  import Sticker from './Sticker.vue'
  let initTop

  // get offset top
  function getAbsoluteTop(dom) {
    return dom && dom.getBoundingClientRect
        ? dom.getBoundingClientRect().top +
        document.body.scrollTop +
        document.documentElement.scrollTop
        : 0
  }

  export default {
    components: {
      Sticker,
    },

    data() {
      return {
        activeIndex: 0,
      }
    },

    computed: {
      $page() {
        return page;
      },
      $frontmatter() {
        return $page.frontmatter;
      },
      visible() {
        return (
            this.$frontmatter &&
            this.$frontmatter.toc !== false &&
            !!(this.$page && this.$page.headers && this.$page.headers.length)
        )
      },
    },

    watch: {
      activeIndex() {
        const items = this.$refs.chairTocItem || []
        const dom = items[this.activeIndex]
        if (!dom) return
        const rect = dom.getBoundingClientRect()
        const wrapperRect = this.$el.getBoundingClientRect()
        const top = rect.top - wrapperRect.top
        if (top < 20) {
          this.$el.scrollTop = this.$el.scrollTop + top - 20
        } else if (top + rect.height > wrapperRect.height) {
          this.$el.scrollTop += rect.top - (wrapperRect.height - rect.height)
        }
      },

      $route() {},
    },

    mounted() {
      // sync visible to parent component
      const syncVisible = () => {
        this.$emit('visible-change', this.visible)
      }
      syncVisible()
      this.$watch('visible', syncVisible)

      // binding event
      setTimeout(() => this.triggerEvt(), 1000)

      this._onScroll = () => this.onScroll()
      this._onHashChange = () => {
        const hash = decodeURIComponent(location.hash.substring(1))
        const index = (this.$page.headers || []).findIndex(h => h.slug === hash)
        if (index >= 0) this.activeIndex = index
        const dom = hash && document.getElementById(hash)
        if (dom) window.scrollTo(0, getAbsoluteTop(dom) - 20)
      }
      window.addEventListener('scroll', this._onScroll)
      // window.addEventListener('hashchange', this._onHashChange);
    },

    beforeDestroy() {
      window.removeEventListener('scroll', this._onScroll)
      window.removeEventListener('hashchange', this._onHashChange)
    },

    methods: {
      onScroll() {
        if (initTop === undefined) {
          initTop = getAbsoluteTop(this.$el)
        }

        // update position
        const scrollTop =
            document.body.scrollTop + document.documentElement.scrollTop
        const headings = this.$page.headers || []

        // change active toc with scrolling
        let i = 0
        const addLink = index => {
          this.activeIndex = index
        }

        for (; i < headings.length; i++) {
          const dom = document.getElementById(headings[i].slug)
          const top = getAbsoluteTop(dom)
          if (top - 50 < scrollTop) {
            addLink(i)
          } else {
            if (!i) addLink(i)
            break
          }
        }
      },

      triggerEvt() {
        this._onScroll()
        this._onHashChange()
      },
    },
  }
</script>