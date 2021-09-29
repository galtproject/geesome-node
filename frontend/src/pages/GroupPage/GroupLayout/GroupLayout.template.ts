module.exports = `
<posts-container mode="tight">
  <div class="group-info-container">
    <group-info v-if="group" :group="group"></group-info>
  </div>

  <group-header v-if="group" :group="group"></group-header>

  <router-view :group="group"></router-view>
</posts-container>
`;