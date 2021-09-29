module.exports = `<div class="ipld-view">
  <div v-for="key in ipldKeys" class="ipld-item">
    <div>{{key}}:</div>
    <ipld-view v-if="isIpldHashByKey[key]" :ipld="ipldData[key]"></ipld-view>
    <div v-else>{{ipldData[key]}}</div>
  </div>
</div>
`;