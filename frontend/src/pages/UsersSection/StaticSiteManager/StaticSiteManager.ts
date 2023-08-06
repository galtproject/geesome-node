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
	},
	methods: {
		async getPendingOperations(startedAt = null) {
			this.pendingOperations = await this.$geesome.findAsyncOperations('run-static-site-generator', `type:${this.type};id:${this.dbGroup.id};%`, null);
			console.log('this.pendingOperations', this.pendingOperations);
			if (this.pendingOperations.length) {
				if (this.pendingOperations[0].inProcess || (startedAt && this.pendingOperations[0].createdAt > startedAt)) {
					this.waitForOperation(this.pendingOperations[0]);
					return true;
				}
			}
			return false;
		},
		async getGroup() {
			[this.dbGroup] = await Promise.all([
				this.$geesome.getDbGroup(this.groupId),
			]);
		},
		async getData() {
			await this.getGroup();
			[this.defaultOptions, this.siteInfo] = await Promise.all([
				this.$geesome.staticSiteGetDefaultOptions(this.type, this.dbGroup.id),
				this.$geesome.getStaticSiteInfo(this.type, this.dbGroup.id)
			]);
			this.getPendingOperations();
			this.checkSocNetChannel();
			this.setDefaultOptions();
		},
		setDefaultOptions() {
			if (this.options) {
				return;
			}
			this.options = {
				view: this.dbGroup.view,
				...this.defaultOptions,
				baseStorageUri: this.defaultOptions.baseStorageUri || this.$geesome.getServerStorageUri(),
			}
		},
		async runGenerate() {
			this.loading = true;
			this.done = false;
			const startedAt = new Date();
			const res = await this.$geesome.staticSiteRunGenerate(this.type, this.dbGroup.id, this.options);
			this.getGroup();
			if (res && res.asyncOperation) {
				this.waitForOperation(res.asyncOperation);
				this.loading = false;
			} else {
				const isFound = await this.getPendingOperations(startedAt);
				if (isFound) {
					return;
				}
				const interval = setInterval(async () => {
					const isFound = await this.getPendingOperations(startedAt);
					if (isFound) {
						clearInterval(interval);
					}
				}, 10 * 1000)
			}
		},
		async bindToStaticAndSaveOptions() {
			await this.$geesome.updateStaticSiteInfo(this.siteInfo.id, {
				name: this.options.site.name,
				title: this.options.site.title,
				options: JSON.stringify(this.options)
			});
			await this.$geesome.staticSiteBind(this.siteInfo.id);
		},
		waitForOperation(operation) {
			this.curOperation = operation;
			this.$geesome.waitForAsyncOperation(operation.id, async (op) => {
				//TODO: cancel wait on new operation
				if (op.id < this.curOperation.id) {
					return;
				}
				console.log('op', op);
				const prevOperation = this.curOperation;
				this.curOperation = op;
				if (!op.inProcess) {
					await this.getData();
					await this.bindToStaticAndSaveOptions().catch(e => {
						this.$notify({
							type: 'error',
							title: 'Bind to static error',
							text: e.message
						})
					});
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
			//TODO: check groupId in socNetDb
			this.socNetChannel = await this.$geesome.socNetDbChannel('telegram', {groupId: this.groupId});
			console.log('socNetChannel', this.socNetChannel);
		},
		setAutoGenerate() {
			this.$root.$asyncModal.open({
				id: 'soc-net-auto-import',
				component: SocNetAutoImport,
				props: {
					dbChannel: this.socNetChannel,
					dbStaticSite: this.siteInfo,
					staticSiteOptions: this.options
				},
				onClose: async (success) => {
					if (success) {
						this.$notify({
							type: 'success',
							title: 'Success'
						});
						this.getData();
					}
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
				this.siteLink = (await this.$geesome.getContentLink(this.siteInfo.staticId || this.siteInfo.storageId)) + '/';
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
		groupId() {
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
