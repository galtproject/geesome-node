import {IGeesomeApp} from "../../../interface";
import IGeesomeEthereumAuthorizationModule from "./interface";

module.exports = (app: IGeesomeApp, ethereumAuthorizationModule: IGeesomeEthereumAuthorizationModule) => {
	/**
	 * @api {post} /v1/generate-auth-message Generate auth message
	 * @apiDescription Auth messages is used to sign by account address (Ethereum for example). You have to use private key of account address to sign the message and send result to /v1/login/auth-message.
	 * @apiName GenerateAuthMessage
	 * @apiGroup Login
	 *
	 * @apiParam {String} accountProvider Provider name, "ethereum" for example
	 * @apiParam {String} accountAddress
	 *
	 * @apiInterface (../../app/interface.ts) {IUserAuthMessageResponse} apiSuccess
	 */
	app.ms.api.onPost('/v1/generate-auth-message', async (req, res) => {
		res.send(await ethereumAuthorizationModule.generateUserAccountAuthMessage(req.body.accountProvider, req.body.accountAddress));
	});

	/**
	 * @api {post} /v1/login/auth-message Login by account signature
	 * @apiDescription You have to sign (by MetaMask for example) "message" from /v1/generate-auth-message and send result inside "signature" field.
	 * @apiName LoginAuthMessage
	 * @apiGroup Login
	 *
	 * @apiParam {Number} authMessageId Id from /v1/generate-auth-message response
	 * @apiParam {String} accountAddress
	 * @apiParam {String} signature
	 * @apiParam {Any} params Special params of provider, {fieldName: String}(field that used in message for signing) in Ethereum.
	 *
	 * @apiInterface (../../app/interface.ts) {IUserAuthResponse} apiSuccess
	 */
	app.ms.api.onPost('/v1/login/auth-message', async (req, res) => {
		ethereumAuthorizationModule.loginAuthMessage(req.body.authMessageId, req.body.accountAddress, req.body.signature, req.body.params)
			.then(user => app.ms.api.handleAuthResult(res, user))
			.catch((err) => {
				console.error(err);
				res.send(403)
			});
	});
}
