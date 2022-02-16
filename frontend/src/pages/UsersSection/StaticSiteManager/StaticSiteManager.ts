/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export default {
	template: require('./StaticSiteManager.template'),
	components: {},
	async created() {
		this.getGroup();
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
			[this.dbGroup, this.defaultOptions] = await Promise.all([
				this.$coreApi.getDbGroup(this.dbGroupId),
				this.$coreApi.staticSiteGetDefaultOptions(this.type, this.dbGroupId)
			]);
			this.options = {
				site: {
					title: this.dbGroup.title,
					description: this.dbGroup.description,
				},
				post: this.defaultOptions.post,
				postList: this.defaultOptions.postList,
			}
		},
		async runGenerate() {
			this.loading = true;
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
					this.loading = false;
				}
			})
		}
	},
	watch: {
		async staticSiteManifestStorageId() {
			if (!this.staticSiteManifestStorageId) {
				this.staticSiteManifest = null;
				return;
			}
			this.staticSiteManifest = await this.$coreApi.getObject(this.staticSiteManifestStorageId);
			console.log('this.staticSiteManifest', this.staticSiteManifest);
			if (this.staticSiteStorageId) {
				this.siteLink = await this.$coreApi.getContentLink(this.staticSiteStorageId);
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
		staticSiteManifestStorageId() {
			return this.dbGroup && this.dbGroup.propertiesJson ? JSON.parse(this.dbGroup.propertiesJson).staticSiteManifestStorageId : '';
		},
		staticSiteStorageId() {
			return this.staticSiteManifest ? this.staticSiteManifest.storageId : '';
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
			staticSiteManifest: null,
			defaultOptions: null,
			options: null,
			siteLink: null,
		};
	}
}
