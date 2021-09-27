module.exports = `
<div class="md-layout" style="justify-content: center; height: 100%;">
  <div :class="['md-layout-item', mode + '-content']">
    <slot></slot>
  </div>
</div>
`;


