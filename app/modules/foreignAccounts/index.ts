import {IGeesomeApp} from "../../interface";
import IGeesomeForeignAccountsModule, {IAuthMessage, IForeignAccount} from "./interface";
import {CorePermissionName} from "../database/interface";
import pIteration from 'p-iteration';

export default async (app: IGeesomeApp) => {
	app.checkModules([]);

	const module = getModule(app, await (await import('./models')).default(app.ms.database.sequelize));
	(await import('./api')).default(app, module);
	return module;
}

function getModule(app: IGeesomeApp, models) {
	class ForeignAccountsModule implements IGeesomeForeignAccountsModule {

		async setUserAccounts(userId: number, accounts: IForeignAccount[]): Promise<IForeignAccount[]> {
			//TODO: validate signatures and providers
			return pIteration.map(accounts, acc => {
				return acc.id ? this.updateAccount(userId, acc.id, acc) : this.createAccount(userId, acc);
			})
		}

		async createAccount(userId: number, account: IForeignAccount): Promise<IForeignAccount> {
			account.address = account.address.toLowerCase();
			return models.ForeignAccount.create({
				...account,
				userId
			})
		}

		async updateAccount(userId: number, id: number, updateData: IForeignAccount): Promise<IForeignAccount> {
			const account = await models.ForeignAccount.findOne({where: {id}});
			if (account.userId !== userId ) {
				throw new Error("not_permitted");
			}
			if (updateData.address) {
				updateData.address = updateData.address.toLowerCase();
			}
			return models.ForeignAccount.update(updateData, {where: {id}})
				.then(() => models.ForeignAccount.findOne({where: {id}}))
		}

		async getUserAccount(id): Promise<IForeignAccount> {
			return models.ForeignAccount.findOne({where: {id}});
		}

		getUserAccountByProvider(userId, provider): Promise<IForeignAccount> {
			return models.ForeignAccount.findOne({where: {userId, provider}});
		}

		getUserAccountByAddress(provider, address): Promise<IForeignAccount> {
			address = address.toLowerCase();
			return models.ForeignAccount.findOne({where: {address, provider}});
		}

		async getUserAccountsList(userId: number): Promise<IForeignAccount[]> {
			return models.ForeignAccount.findAll({where: {userId}});
		}

		async createAuthMessage(authMessageData) {
			return models.UserAuthMessage.create(authMessageData);
		}

		async getAuthMessage(id) {
			return models.UserAuthMessage.findOne({where: {id}}) as IAuthMessage;
		}

		async beforeEntityManifestStore(userId: number, entityName: string, entity: any, manifestData: any) {
			manifestData.foreignAccounts = await this.getUserAccountsList(userId).then(list => {
				return list.map(({provider, address, signature}) => ({provider, address, signature}))
			});
		}

		afterUserRegistering(userId: number, userData: any) {
			console.log('afterUserRegistering', userData.foreignAccounts);
			if (userData.foreignAccounts) {
				return this.setUserAccounts(userId, userData.foreignAccounts);
			}
		}

		async beforeUserRegistering(userId: number, userData: any, metaData: any) {
			if (userId && await app.isAdminCan(userId, CorePermissionName.AdminAddUser)) {
				return; // skip signature check
			}
			if (!userData.foreignAccounts) {
				return;
			}
			const supportedProviders = await app.callHook('foreignAccounts', 'getForeignAccountAuthorizationProvider', []);
			userData.foreignAccounts.forEach(acc => {
				if (!supportedProviders.includes(acc.provider)) {
					this.throwError('not_supported_provider');
				}
			});
		}

		throwError(message) {
			throw Error('foreignAccounts:' + message);
		}

		async flushDatabase() {
			await pIteration.forEachSeries(['ForeignAccount'], (modelName) => {
				return models[modelName].destroy({where: {}});
			});
		}
	}

	return new ForeignAccountsModule();
}