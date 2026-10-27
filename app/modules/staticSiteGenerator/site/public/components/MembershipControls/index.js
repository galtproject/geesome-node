export default {
    inject: ['store'],
    mounted() {
        const script = document.createElement('script');
        script.src = this.store.membership.scriptUrl;
        script.onerror = () => {
            this.$el.querySelector('#membership-panel').hidden = false;
            this.$el.querySelector('[role=status]').textContent = 'Account controls could not load. Reload to retry.';
        };
        document.head.append(script);
    },
    template: `
      <section class="membership-controls">
        <button id="membership-open" type="button" disabled>Account and subscription</button>
        <section id="membership-panel" hidden><p role="status"></p></section>
      </section>
    `,
};
