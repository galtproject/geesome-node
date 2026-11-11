export default interface ISocNetPublishingModule {
	setCronWorker(worker: any): void;
	stop(): Promise<void>;
	processServerQueue(input?: any): Promise<any>;
	claimServerJob(): Promise<any>;
	updateServerDestinationSettings(userId: number, id: number, input: any): Promise<any>;
	setupServerDestination(userId: number, input: any): Promise<any>;
	loadServerAccount(userId: number, accountId: number, network: string, identity: string): Promise<any>;
	disableDestination(userId: number, id: any, input: any): Promise<any>;
	listDestinationGroups(userId: number, query?: any): Promise<any>;
	createDestinationGroup(userId: number, input: any): Promise<any>;
	updateDestinationGroup(userId: number, id: any, input: any): Promise<any>;
	listDestinations(userId: number, query?: any): Promise<any>;
	registerDestinations(userId: number, clientId: string, input: any): Promise<any>;
	claimDestinationJob(userId: number, clientId: string, input: any): Promise<any>;
	shuffleQueue(userId: number, input: any): Promise<any>;
	flushDatabase(): Promise<void>;
	compose(userId: number, input: any): Promise<any>;
	getOutbox(userId: number, query?: any): Promise<any>;
	listSources(userId: number, query?: any): Promise<any>;
	createSource(userId: number, input: any): Promise<any>;
	createJob(userId: number, input: any): Promise<any>;
	listJobs(userId: number, query?: any): Promise<any[]>;
	claimJob(userId: number, input: any, clientContext?: any): Promise<any>;
	reportResult(userId: number, jobId: any, input: any, clientId?: string): Promise<any>;
	cancelJob(userId: number, jobId: any): Promise<any>;
}
