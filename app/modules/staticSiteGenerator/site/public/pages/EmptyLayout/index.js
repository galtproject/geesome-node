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
          <div class="page-header-content" v-if="headerHtml" v-html="headerHtml"></div>
          <div class="powered"><span>Powered by <a href="https://github.com/galtproject/geesome-node" target="_blank">Geesome</a></span></div>
        </div>
        <div class="page-body">
          <slot name="page"/>
        </div>
        <div class="page-footer">
          <div class="page-footer-content" v-if="footerHtml" v-html="footerHtml"></div>
        </div>
      </div>
      <!--    <Footer />-->
    `
}
