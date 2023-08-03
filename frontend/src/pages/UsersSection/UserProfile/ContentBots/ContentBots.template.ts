module.exports = `
<div>
	<div style="display: flex; justify-content: space-between;">
	  <h3>Content bots</h3>
	
	  <md-button class="md-primary" @click="addContentBot">Add bot</md-button>
	</div>
	
	<md-table>
	  <md-table-row>
		<md-table-head>Username</md-table-head>
		<md-table-head>Social Network</md-table-head>
		<md-table-head>Users</md-table-head>
	  </md-table-row>
	
	  <md-table-row v-for="item in contentBots">
		<md-table-cell>{{item.botUsername}}</md-table-cell>
		<md-table-cell>{{item.socNet | prettyName}}</md-table-cell>
		<md-table-cell><md-button class="md-primary" @click="addUser(item)">Add user</md-button></md-table-cell>
	  </md-table-row>
	</md-table>
</div>
`;