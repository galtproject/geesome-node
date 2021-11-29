/*
 * Copyright ©️ 2018-2021 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2021 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import AddSocNetClientModal from "../modals/AddSocNetClientModal/AddSocNetClientModal";

export default {
	template: require('./SocNetClient.template'),
	components: {},
	async created() {
		this.getAccount();
		this.getChannels();
	},
	methods: {
		async getAccount() {
			this.account = await this.$coreApi.socNetDbAccount(this.$route.params.socNet, {id: this.$route.params.accId});
			console.log('this.account', this.account);
			this.incorrectSessionKey = !this.$coreApi.isSocNetSessionKeyCorrect(this.account);
		},
		async getChannels() {
			this.channels = await this.$coreApi.socNetGetChannels(this.$route.params.socNet, {id: this.$route.params.accId});
			console.log('this.channels', this.channels);
		},
		login() {
			this.$root.$asyncModal.open({
				id: 'add-soc-net-client-modal',
				component: AddSocNetClientModal,
				props: { account: this.account },
				onClose: async () => {
					this.getAccount();
					this.getChannels();
				}
			});
		}
	},
	watch: {},
	computed: {
		currentUser() {
			return this.$store.state.user;
		},
		showChannels() {
			if (this.onlyAdmined) {
				return this.channels.filter(c => c.adminRights);
			}
			return this.channels;
		}
	},
	data() {
		return {
			localeKey: 'user_profile',
			account: null,
			channels: [],
			onlyAdmined: true,
			incorrectSessionKey: false,
		};
	}
}
