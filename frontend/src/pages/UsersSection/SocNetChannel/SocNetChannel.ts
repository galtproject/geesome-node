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
		async getDbChannel() {
			this.dbChannel = await this.$coreApi.socNetDbChannel(this.$route.params.socNet, {channelId: this.$route.params.channelId});
			console.log('dbChannel', this.dbChannel);
		},
		async getPendingOperations() {
			await this.getDbChannel();
			if (!this.dbChannel) {
				this.pendingOperations = [];
				return;
			}
			this.getGroup();
			this.pendingOperations = await this.$coreApi.findAsyncOperations('run-telegram-channel-import', 'id:' + this.dbChannel.id + ';%');
			console.log('this.pendingOperations', this.pendingOperations);
			if (this.pendingOperations.length) {
				this.waitForOperation(this.pendingOperations[0]);
			}
		},
		async getGroup() {
			this.dbGroup = await this.$coreApi.getDbGroup(this.dbChannel.groupId);
		},
		async getPosts() {

		},
		async runImport() {
			this.loading = true;
			const {asyncOperation} = await this.$coreApi.socNetRunChannelImport(this.$route.params.socNet, {id: this.$route.params.accId}, this.$route.params.channelId);
			await this.getDbChannel();
			this.getGroup();
			this.waitForOperation(asyncOperation);
			this.loading = false;
		},
		waitForOperation(operation) {
			this.curOperation = operation;
			this.$coreApi.waitForAsyncOperation(operation.id, (op) => {
				//TODO: cancel wait on new operation
				if (op.id < this.curOperation.id) {
					return;
				}
				console.log('op', op)
				if (op.percent > this.curOperation.percent) {
					this.getGroup();
				}
				this.curOperation = op;
				if (!op.inProcess) {
					this.curOperation = null;
				}
			})
		}
	},
	watch: {},
	computed: {
		currentUser() {
			return this.$store.state.user;
		},
		percent() {
			return Math.round(this.curOperation.percent);
		},
	},
	data() {
		return {
			localeKey: 'soc_net_channel',
			loading: false,
			info: null,
			dbChannel: null,
			dbGroup: null,
			posts: [],
			totalPostsCount: 0,
			pendingOperations: [],
			curOperation: null,
		};
	}
}
