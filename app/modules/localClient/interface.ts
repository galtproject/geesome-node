export default interface ILocalClientModule {
	flushDatabase(): Promise<void>;
	compose(userId: number, input: any): Promise<any>;
	getOutbox(userId: number, query?: any): Promise<any>;
	createJob(userId: number, input: any): Promise<any>;
	listJobs(userId: number, query?: any): Promise<any[]>;
	claimJob(userId: number, input: any): Promise<any>;
	reportResult(userId: number, jobId: any, input: any): Promise<any>;
	cancelJob(userId: number, jobId: any): Promise<any>;
}
