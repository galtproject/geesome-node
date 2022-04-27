import {IGeesomeApp} from "../../../interface";
import IGeesomeEthereumAuthorizationModule from "./interface";

const ethereumAuthorization = require('geesome-libs/src/ethereum');
const commonHelper = require('geesome-libs/src/common');

module.exports = async (app: IGeesomeApp) => {
	const module = getModule(app);
	require('./api')(app, module);
	return module;
}

function getModule(app: IGeesomeApp) {
	app.checkModules(['database']);

	class EthereumAuthorizationModule implements IGeesomeEthereumAuthorizationModule {

		async generateUserAccountAuthMessage(accountProvider, accountAddress) {
			const userAccount = await app.ms.database.getUserAccountByAddress(accountProvider, accountAddress);
			if (!userAccount) {
				throw new Error("not_found");
			}
			const authMessage = await app.ms.database.createUserAuthMessage({
				provider: accountProvider,
				address: accountAddress,
				userAccountId: userAccount.id,
				message: await commonHelper.random()
			});

			delete authMessage.userAccountId;

			return authMessage;
		}

		async loginAuthMessage(authMessageId, address, signature, params: any = {}) {
			if (!address) {
				throw new Error("not_valid");
			}

			const authMessage = await app.ms.database.getUserAuthMessage(authMessageId);
			if (!authMessage || authMessage.address.toLowerCase() != address.toLowerCase()) {
				throw new Error("not_valid");
			}

			const userAccount = await app.ms.database.getUserAccount(authMessage.userAccountId);
			if (!userAccount || userAccount.address.toLowerCase() != address.toLowerCase()) {
				throw new Error("not_valid");
			}

			const isValid = ethereumAuthorization.isSignatureValid(address, signature, authMessage.message, params.fieldName);
			if (!isValid) {
				throw new Error("not_valid");
			}

			return await app.ms.database.getUser(userAccount.userId);
		}

	}

	return new EthereumAuthorizationModule();
}