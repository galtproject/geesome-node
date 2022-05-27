export default interface IGeesomeGatewayModule {
	port;

	getDnsLinkPathFromRequest(req): Promise<string>;

	onGetRequest(callback);
}