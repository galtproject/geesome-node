module.exports = `
<div>
	<div style="display: flex; justify-content: space-between;">
	  <h3>Social networks clients</h3>
	
	  <md-button class="md-primary" @click="addSocNetClient">Add client</md-button>
	</div>
	
	<md-table>
	  <md-table-row>
		<md-table-head>Account</md-table-head>
		<md-table-head>Social Network</md-table-head>
		<md-table-head></md-table-head>
	  </md-table-row>
	
	  <md-table-row v-for="item in socNetAccounts">
		<md-table-cell><router-link :to="{name: 'soc-net-client', params: {socNet: item.socNet, accId: item.id}}">{{item.fullName}}</router-link></md-table-cell>
		<md-table-cell>{{item.socNet | prettyName}}</md-table-cell>
		<md-table-cell>
		<md-button class="md-accent md-icon-button" @click="editSocNet(item)"><md-icon>sync</md-icon></md-button>
		</md-table-cell>
	  </md-table-row>
	</md-table>
</div>
`;