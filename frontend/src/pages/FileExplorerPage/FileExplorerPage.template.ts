module.exports = `<div id="file-explorer-page" class="container-page">
  <div>
    <h3>Files Explorer</h3>
  </div>
  
  <div style="position: relative; top: -5px;"><a href @click.prevent="showAdvanced = !showAdvanced">Advanced options</a></div>
  
  <div v-if="showAdvanced">
    <md-button class="md-raised md-accent" @click="regeneratePreviews()">
      Re-generate previews
    </md-button>
  </div>
  
  <file-catalog></file-catalog>
</div>
`;