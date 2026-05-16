import debug from 'debug';
import pIteration from 'p-iteration';
import IGeesomeForeignAccountsModule, {IAuthMessage, IForeignAccount} from "./interface.js";
import {CorePermissionName, IListParams, IListParamsOptions} from "../database/interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
const log = debug('geesome:app:foreignAccounts');

const foreignAccountListParams: IListParamsOptions = {
	sortBy: 'provider',
	allowedSortBy: ['provider', 'address', 'createdAt', 'updatedAt', 'id'],
	maxLimit: 100
};

function getForeignAccountListOrder(sortBy, sortDir) {
	const direction = sortDir.toUpperCase();
	const order = [[sortBy, direction]];
	if (sortBy !== 'id') {
		order.push(['id', direction]);
	}
	return order;
}

export default async (app: IGeesomeApp) => {
	app.checkModules(['database']);

	const module = getModule(app, await (await import('./models.js')).default(app.ms.database.sequelize));
	(await import('./api.js')).default(app, module);
	return module;
}

export function getModule(app: IGeesomeApp, models) {
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

		prepareAccountListParams(listParams?: IListParams) {
			listParams = helpers.prepareListParams(listParams, foreignAccountListParams);
			app.ms.database.setDefaultListParamsValues(listParams, foreignAccountListParams);
			return listParams;
		}

		async getUserAccountsList(userId: number, listParams?: IListParams): Promise<IForeignAccount[]> {
			if (!listParams) {
				return models.ForeignAccount.findAll({where: {userId}});
			}
			listParams = this.prepareAccountListParams(listParams);
			const {limit, offset, sortBy, sortDir} = listParams;
			return models.ForeignAccount.findAll({
				where: {userId},
				order: getForeignAccountListOrder(sortBy, sortDir),
				limit,
				offset
			});
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
			log('afterUserRegistering', userData.foreignAccounts);
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
