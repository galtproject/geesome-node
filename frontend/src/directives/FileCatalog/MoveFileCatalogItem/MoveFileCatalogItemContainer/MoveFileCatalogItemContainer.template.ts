module.exports = `
<div class="input-absolute-container autocomplete-container md-elevation-4" ref="container"
     xmlns:v-on="http://www.w3.org/1999/xhtml" :style="{'top': top, 'left': left}">

  <div v-if="showList" class="autocomplete-list">
    <div class="search-container">
      <md-field>
        <label>Search</label>
        <md-input v-model="search"></md-input>
      </md-field>
    </div>
    <div class="list-container">
      <a href v-for="item in items" @click.prevent="selectItem(item)">
        <span>{{item.name}}</span>
      </a>
    </div>
  </div>
</div>
`;