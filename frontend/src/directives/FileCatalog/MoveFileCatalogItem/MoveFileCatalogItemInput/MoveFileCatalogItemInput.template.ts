module.exports = `
<div class="checkbox-selector-input" ref="input" xmlns:v-on="http://www.w3.org/1999/xhtml">
  <md-button @click="openContainer">{{placeholder}}</md-button>
  <!--<ul class="typeahead-list" v-if="show_list" :style="{'top':getHeight}">-->
  <!--<li v-for="item in filtered_list" @click="selectItem(item)">{{item.identifier}}</li>-->
  <!--</ul>-->
</div>
`;