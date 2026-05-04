import {IGeesomeApp} from "../../interface.js";
import IGeesomeEthereumAuthorizationModule from "./interface.js";

export default (app: IGeesomeApp, ethereumAuthorizationModule: IGeesomeEthereumAuthorizationModule) => {
	/**
	 * @api {post} /v1/generate-auth-message Generate auth message
	 * @apiDescription Auth messages is used to sign by account address (Ethereum for example). You have to use private key of account address to sign the message and send result to /v1/login/auth-message.
	 * @apiName GenerateAuthMessage
	 * @apiGroup Login
	 *
	 * @apiBody {String} accountProvider Provider name, "ethereum" for example
	 * @apiBody {String} accountAddress
	 *
	 * @apiInterface (../../interface.ts) {IUserAuthMessageResponse} apiSuccess
	 * @apiUse ValidationErrors
	 *
	 * @apiExample {curl} Example usage
	 *   curl -X POST http://localhost:2052/v1/generate-auth-message \
	 *     -H "Content-Type: application/json" \
	 *     -d '{"accountProvider":"ethereum","accountAddress":"0x0000000000000000000000000000000000000000"}'
	 */
	app.ms.api.onPost('generate-auth-message', async (req, res) => {
		res.send(await ethereumAuthorizationModule.generateUserAccountAuthMessage(req.body.accountProvider, req.body.accountAddress));
	});

	/**
	 * @api {post} /v1/login/auth-message Login by account signature
	 * @apiDescription You have to sign (by MetaMask for example) "message" from /v1/generate-auth-message and send result inside "signature" field.
	 * @apiName LoginAuthMessage
	 * @apiGroup Login
	 *
	 * @apiBody {Number} authMessageId Id from /v1/generate-auth-message response
	 * @apiBody {String} accountAddress
	 * @apiBody {String} signature
	 * @apiBody {Any} params Special params of provider, {fieldName: String}(field that used in message for signing) in Ethereum.
	 *
	 * @apiInterface (../../interface.ts) {IUserAuthResponse} apiSuccess
	 * @apiUse ValidationErrors
	 */
	app.ms.api.onPost('login/auth-message', async (req, res) => {
		ethereumAuthorizationModule.loginAuthMessage(req.body.authMessageId, req.body.accountAddress, req.body.signature, req.body.params)
			.then(user => app.ms.api.handleAuthResult(res, user))
			.catch((err) => {
				console.error(err);
				res.send(403)
			});
	});
}
