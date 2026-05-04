import {IGeesomeApp} from "../../interface.js";
import IGeesomeForeignAccountsModule from "./interface.js";
import {CorePermissionName} from "../database/interface.js";

export default (app: IGeesomeApp, foreignAccountsModule: IGeesomeForeignAccountsModule) => {
	/**
	 * @api {post} /v1/user/set-account Set foreign account
	 * @apiName UserSetForeignAccount
	 * @apiGroup UserForeignAccount
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse ValidationErrors
	 *
	 * @apiInterface (./interface.ts) {IForeignAccount} apiBody
	 * @apiSuccess {Object[]} list Saved accounts.
	 */
	app.ms.api.onAuthorizedPost('user/set-account', async (req, res) => {
		res.send(await foreignAccountsModule.setUserAccounts(req.user.id, [req.body]));
	});

	/**
	 * @api {get} /v1/user/get-accounts List foreign accounts
	 * @apiName UserForeignAccounts
	 * @apiGroup UserForeignAccount
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 *
	 * @apiSuccess {Object[]} list Foreign accounts.
	 */
	app.ms.api.onAuthorizedGet('user/get-accounts', async (req, res) => {
		res.send(await foreignAccountsModule.getUserAccountsList(req.user.id));
	});

	/**
	 * @api {post} /v1/admin/get-user-account Get foreign account by provider address
	 * @apiName AdminGetForeignAccount
	 * @apiGroup AdminUser
	 *
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiUse AdminErrors
	 *
	 * @apiInterface (../../interface.ts) {IForeignAccountLookupInput} apiBody
	 * @apiInterface (./interface.ts) {IForeignAccount} apiSuccess
	 */
	app.ms.api.onAuthorizedPost('admin/get-user-account', async (req, res) => {
		if (!await app.isAdminCan(req.user.id, CorePermissionName.AdminRead)) {
			return res.send(403);
		}
		res.send(await foreignAccountsModule.getUserAccountByAddress(req.body.provider, req.body.address));
	});
}
