export default interface IGeesomeGatewayModule {
	port;

	getDnsLinkFromRequest(req): Promise<string>;

	onGetRequest(callback);
}