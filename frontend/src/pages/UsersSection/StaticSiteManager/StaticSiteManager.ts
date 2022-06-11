/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import SocNetAutoImport from "../modals/SocNetAutoImport/SocNetAutoImport";

export default {
	template: require('./StaticSiteManager.template'),
	components: {},
	async created() {
		this.getData();
		this.getPendingOperations();
	},
	methods: {
		async getPendingOperations() {
			this.pendingOperations = await this.$coreApi.findAsyncOperations('run-static-site-generator', `type:${this.type};id:${this.dbGroupId};%`);
			console.log('this.pendingOperations', this.pendingOperations);
			if (this.pendingOperations.length) {
				this.waitForOperation(this.pendingOperations[0]);
				return true;
			}
			return false;
		},
		async getGroup() {
			[this.dbGroup] = await Promise.all([
				this.$coreApi.getDbGroup(this.dbGroupId),
			]);
		},
		async getData() {
			[this.dbGroup, this.defaultOptions, this.siteInfo] = await Promise.all([
				this.$coreApi.getDbGroup(this.dbGroupId),
				this.$coreApi.staticSiteGetDefaultOptions(this.type, this.dbGroupId),
				this.$coreApi.getStaticSiteInfo(this.type, this.dbGroupId)
			]);
			this.checkSocNetChannel();
			this.setDefaultOptions();
		},
		setDefaultOptions() {
			if (this.options) {
				return;
			}
			this.options = {
				...this.defaultOptions,
				baseStorageUri: this.defaultOptions.baseStorageUri || this.$coreApi.getServerStorageUri(),
			}
		},
		async runGenerate() {
			this.loading = true;
			this.done = false;
			const res = await this.$coreApi.staticSiteRunGenerate(this.type, this.dbGroupId, this.options);
			this.getGroup();
			if (res && res.asyncOperation) {
				this.waitForOperation(res.asyncOperation);
				this.loading = false;
			} else {
				const interval = setInterval(async () => {
					const isFound = await this.getPendingOperations();
					if (isFound) {
						clearInterval(interval);
					}
				}, 10 * 1000)
			}
		},
		async bindToStaticAndSaveOptions() {
			await this.$coreApi.updateStaticSiteInfo(this.type, this.dbGroupId, {
				name: this.options.name,
				title: this.options.title,
				options: JSON.stringify(this.options)
			});
			await this.$coreApi.staticSiteBind(this.type, this.dbGroupId, this.options.site.name);
		},
		waitForOperation(operation) {
			this.curOperation = operation;
			this.$coreApi.waitForAsyncOperation(operation.id, async (op) => {
				//TODO: cancel wait on new operation
				if (op.id < this.curOperation.id) {
					return;
				}
				console.log('op', op);
				const prevOperation = this.curOperation;
				this.curOperation = op;
				if (!op.inProcess) {
					await this.bindToStaticAndSaveOptions();
					await this.getData();
					this.curOperation = null;
					this.loading = false;
					this.done = true;
				} else if(op.percent > prevOperation.percent) {
					await this.getGroup();
				}
			})
		},
		toggleAdvanced() {
			this.showAdvanced = !this.showAdvanced;
		},
		async checkSocNetChannel() {
			console.log('checkSocNetChannel');
			//TODO: use more unified way to run autoimport
			this.socNetChannel = await this.$coreApi.socNetDbChannel('telegram', {groupId: this.dbGroupId});
			console.log('socNetChannel', this.socNetChannel);
		},
		setAutoGenerate() {
			this.$root.$asyncModal.open({
				id: 'soc-net-auto-import',
				component: SocNetAutoImport,
				props: {
					dbChannel: this.socNetChannel,
					staticSiteOptions: this.options
				},
				onClose: async () => {
					this.getData();
				}
			});
		},
	},
	watch: {
		async siteInfo() {
			console.log('this.siteInfo', this.siteInfo);
			if (!this.siteInfo) {
				this.siteLink = null;
				return;
			}
			if (this.siteInfo) {
				this.siteLink = await this.$coreApi.getContentLink(this.siteInfo.staticId || this.siteInfo.storageId);
			}
		}
	},
	computed: {
		currentUser() {
			return this.$store.state.user;
		},
		type() {
			return this.$route.params.type;
		},
		dbGroupId() {
			return this.$route.params.id;
		},
		percent() {
			return this.curOperation ? this.curOperation.percent : 0;
		}
	},
	data() {
		return {
			localeKey: 'static_site_manager',
			loading: false,
			dbGroup: null,
			pendingOperations: [],
			curOperation: null,
			defaultOptions: null,
			options: null,
			siteLink: null,
			done: false,
			siteInfo: null,
			showAdvanced: false,
			socNetChannel: null,
		};
	}
}
