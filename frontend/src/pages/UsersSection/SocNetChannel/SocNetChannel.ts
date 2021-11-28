/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default {
	template: require('./SocNetChannel.template'),
	components: {},
	async created() {
		this.getChannelInfo();
		this.getPendingOperations();
	},
	methods: {
		async getChannelInfo() {
			this.info = await this.$coreApi.socNetGetChannelInfo(this.$route.params.socNet, {id: this.$route.params.accId}, this.$route.params.channelId);
			console.log('this.info', this.info);
		},
		async getPendingOperations() {
			const dbChannel = await this.$coreApi.socNetDbChannel(this.$route.params.socNet, {channelId: this.$route.params.channelId});
			console.log('dbChannel', dbChannel);
			if (!dbChannel) {
				this.pendingOperations = [];
				return;
			}
			this.pendingOperations = await this.$coreApi.findAsyncOperations('run-telegram-channel-import', 'id:' + dbChannel.id + ';%');
			console.log('this.pendingOperations', this.pendingOperations);
		},
		async getPosts() {

		},
		async runImport() {
			const {asyncOperation} = await this.$coreApi.socNetRunChannelImport(this.$route.params.socNet, {id: this.$route.params.accId}, this.$route.params.channelId);
			console.log('this.importResponse', asyncOperation);
			// this.$coreApi.waitForAsyncOperation(asyncOperation.id, (operation) => {
			// 	console.log('operation', operation);
			// })
		}
	},
	watch: {},
	computed: {
		currentUser() {
			return this.$store.state.user;
		},
	},
	data() {
		return {
			localeKey: 'soc_net_channel',
			info: null,
			posts: [],
			totalPostsCount: 0,
			pendingOperations: [],
		};
	}
}
