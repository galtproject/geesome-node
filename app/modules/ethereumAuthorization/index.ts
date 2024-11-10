import commonHelper from "geesome-libs/src/common.js";
import geesomeMessages from "geesome-libs/src/messages.js";
import ethereumAuthorization from "geesome-libs/src/ethereum.js";
import IGeesomeForeignAccountsModule from "../foreignAccounts/interface.js";
import IGeesomeEthereumAuthorizationModule from "./interface.js";
import {CorePermissionName} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";

export default async (app: IGeesomeApp) => {
	const module = getModule(app);
	(await import('./api')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database', 'foreignAccounts']);

	const foreignAccounts = app.ms['foreignAccounts'] as IGeesomeForeignAccountsModule;

	class EthereumAuthorizationModule implements IGeesomeEthereumAuthorizationModule {

		async generateUserAccountAuthMessage(accountProvider, accountAddress) {
			const userAccount = await foreignAccounts.getUserAccountByAddress(accountProvider, accountAddress);
			if (!userAccount) {
				throw new Error("not_found");
			}
			const authMessage = await foreignAccounts.createAuthMessage({
				provider: accountProvider,
				address: accountAddress,
				userAccountId: userAccount.id,
				message: await this.getAuthorizationMessage(commonHelper.makeCode(16))
			});

			delete authMessage.userAccountId;

			return authMessage;
		}

		async loginAuthMessage(authMessageId, address, signature, params: any = {}) {
			if (!address) {
				throw new Error("not_valid");
			}

			const authMessage = await foreignAccounts.getAuthMessage(authMessageId);
			if (!authMessage || authMessage.address.toLowerCase() != address.toLowerCase()) {
				throw new Error("not_valid");
			}

			const userAccount = await foreignAccounts.getUserAccount(authMessage.userAccountId);
			if (!userAccount || userAccount.address.toLowerCase() != address.toLowerCase()) {
				throw new Error("not_valid");
			}

			const isValid = ethereumAuthorization.isSignatureValid(address, signature, authMessage.message, params.fieldName);
			if (!isValid) {
				throw new Error("not_valid");
			}

			return await app.ms.database.getUser(userAccount.userId);
		}

		async getAuthorizationMessage(code) {
			const selfIpnsId = await app.ms.staticId.getSelfStaticAccountId();
			return geesomeMessages.login(selfIpnsId, code);
		}

		getForeignAccountAuthorizationProvider() {
			return 'ethereum';
		}

		async beforeUserRegistering(userId: number, userData: any, metaData: any) {
			if (userId && await app.isAdminCan(userId, CorePermissionName.AdminAddUser)) {
				return; // skip signature check
			}

			if (!userData.foreignAccounts) {
				return;
			}
			userData.foreignAccounts.forEach(acc => {
				if (acc.provider !== this.getForeignAccountAuthorizationProvider()) {
					return;
				}
				if (!acc.signature) {
					throw new Error("signature_required");
				}
				if (metaData.checkMessage) {
					const isValid = ethereumAuthorization.isSignatureValid(
						acc.address,
						acc.signature,
						metaData.checkMessage,
						'message'
					);
					if (!isValid) {
						this.throwError('account_signature_not_valid');
					}
				} else {
					this.throwError('unknown_metadata');
				}
			});
		}

		throwError(message) {
			throw Error('ethereumAuthorization:' + message);
		}
	}

	return new EthereumAuthorizationModule();
}
