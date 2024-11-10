export default {
    components: {
    },
    inject: ['store'],
    computed: {
        headerHtml() {
            return this.store.options.headerHtml;
        },
        footerHtml() {
            return this.store.options.footerHtml;
        },
    },
    mounted() {
    },
    template: `
      <div>
        <div class="page-header">
          <template v-if="headerHtml" v-html="headerHtml"></template>
        </div>
        <div class="page-content">
          <slot name="page"/>
        </div>
        <div class="page-footer">
          <template v-if="footerHtml" v-html="footerHtml"></template>
          <div class="powered">Powered by <a href="https://github.com/galtproject/geesome-node" target="_blank">Geesome</a></div>
        </div>
      </div>
      <!--    <Footer />-->
    `
}
