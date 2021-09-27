module.exports = `
<div>
  <md-card>
    <md-card-header>
      <div class="md-title">Last updates</div>
    </md-card-header>

    <md-card-content style="padding-top: 0; padding-bottom: 0;">
      <md-tabs class="simple-tabs" @md-changed="setActiveTab">
        <md-tab id="content" md-label="Content"></md-tab>
        <md-tab id="users" md-label="Users"></md-tab>
        <md-tab id="groups" md-label="Groups"></md-tab>
      </md-tabs>

      <md-field>
        <label>Search</label>
        <md-input v-model="search"></md-input>
      </md-field>
    </md-card-content>

    <md-card-content style="padding-top: 0;" v-if="activeTab === 'content'">
      <md-table>
        <md-table-row>
          <md-table-head>Name</md-table-head>
          <md-table-head>Size</md-table-head>
          <md-table-head>IPFS hash</md-table-head>
          <md-table-head>Manifest IPFS hash</md-table-head>
        </md-table-row>

        <md-table-row v-for="item in items">
          <md-table-cell>
            <pretty-name :name="item.name"></pretty-name>
          </md-table-cell>
          <md-table-cell>{{item.size | prettySize}}</md-table-cell>
          <md-table-cell>
            <pretty-hex :hex="item.storageId"></pretty-hex>
          </md-table-cell>
          <md-table-cell>
            <pretty-hex :hex="item.manifestStorageId"></pretty-hex>
          </md-table-cell>
        </md-table-row>
      </md-table>
    </md-card-content>

    <md-card-content style="padding-top: 0;" v-if="activeTab === 'users'">
      <md-table>
        <md-table-row>
          <md-table-head>Name</md-table-head>
          <md-table-head>Email</md-table-head>
          <md-table-head>IPNS hash</md-table-head>
        </md-table-row>

        <md-table-row v-for="item in items">
          <md-table-cell>{{item.name}}</md-table-cell>
          <md-table-cell>{{item.email}}</md-table-cell>
          <md-table-cell>
            <pretty-hex :hex="item.storageAccountId" :to="{name: 'user-profile', params:{staticId: item.storageAccountId}}"></pretty-hex>
          </md-table-cell>
        </md-table-row>
      </md-table>
    </md-card-content>

    <md-card-content style="padding-top: 0;" v-if="activeTab === 'groups'">
      <md-table>
        <md-table-row>
          <md-table-head>Name</md-table-head>
          <md-table-head>Title</md-table-head>
          <md-table-head>IPNS hash</md-table-head>
          <md-table-head>IPLD hash</md-table-head>
        </md-table-row>

        <md-table-row v-for="item in items">
          <md-table-cell>{{item.name}}</md-table-cell>
          <md-table-cell>{{item.title}}</md-table-cell>
          <md-table-cell>
            <pretty-hex :hex="item.manifestStaticStorageId"></pretty-hex>
          </md-table-cell>
          <md-table-cell>
            <pretty-hex :hex="item.manifestStorageId"></pretty-hex>
          </md-table-cell>
        </md-table-row>
      </md-table>
    </md-card-content>
  </md-card>
</div>
`;