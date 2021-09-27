module.exports = `
<div id="boot-nodes-page" class="container-page">
  <md-card>
    <md-card-header>
      <div class="md-title">Current node addresses</div>
    </md-card-header>

    <md-card-content style="padding-top: 0;">
      <ul>
        <li v-for="address in currentNodeAddressList">
          <pretty-hex :hex="address" :full="true"></pretty-hex>
        </li>
      </ul>
    </md-card-content>
  </md-card>

  <md-card>
    <md-card-header>
      <div class="md-title">
        <span>Boot nodes ({{bootNodes.length}})</span>
        <md-button class="md-icon-button md-primary" @click="addBootNode">
          <md-icon class="fas fa-plus"></md-icon>
        </md-button>
      </div>
    </md-card-header>

    <md-card-content style="padding-top: 0;">
      <md-table>
        <md-table-row>
          <md-table-head>Address</md-table-head>
          <md-table-head></md-table-head>
        </md-table-row>

        <md-table-row v-for="item in bootNodes">
          <md-table-cell>
            <pretty-hex :hex="item" :full="true"></pretty-hex>
          </md-table-cell>
          <md-table-cell>
            <md-button class="md-icon-button md-primary" @click="removeBootNode(item)">
              <md-icon class="fas fa-times"></md-icon>
            </md-button>
          </md-table-cell>
        </md-table-row>
      </md-table>
    </md-card-content>
  </md-card>
</div>
`;