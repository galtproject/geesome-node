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
        <template v-if="headerHtml" v-html="headerHtml"></template>
        <slot name="page"/>
        <template v-if="footerHtml" v-html="footerHtml"></template>
      </div>
      <!--    <Footer />-->
    `
}
