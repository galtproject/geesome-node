module.exports = `
<div>
	<div style="display: flex; justify-content: space-between;">
	  <h3>Api keys</h3>
	
	  <md-button class="md-primary" @click="addApiKey">Add api key</md-button>
	</div>
	
	<md-table>
	  <md-table-row>
		<md-table-head>Title</md-table-head>
		<md-table-head>Type</md-table-head>
		<md-table-head>Permissions</md-table-head>
		<md-table-head>Created at</md-table-head>
		<md-table-head>Expired on</md-table-head>
		<md-table-head></md-table-head>
	  </md-table-row>
	
	  <md-table-row v-for="item in apiKeys">
		<md-table-cell>{{item.title}}</md-table-cell>
		<md-table-cell>{{item.type}}</md-table-cell>
		<md-table-cell>{{item.permissions}}</md-table-cell>
		<md-table-cell>{{item.createdAt}}</md-table-cell>
		<md-table-cell>{{item.expiredOn}}</md-table-cell>
		<md-table-cell><md-button class="md-accent md-icon-button" @click="editApiKey(item)"><md-icon>edit</md-icon></md-button></md-table-cell>
	  </md-table-row>
	</md-table>
</div>
`;