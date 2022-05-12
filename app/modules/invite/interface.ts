import {IInvite, IListParams, IUser, IUserApiKey} from "../database/interface";
import {IInvitesListResponse, IUserInput} from "../../interface";

export default interface IGeesomeInviteModule {
	registerUserByInviteCode(inviteCode: string, userData: IUserInput): Promise<{user: IUser, apiKey: IUserApiKey}>;

	createInvite(userId, inviteData: IInvite): Promise<IInvite>;

	updateInvite(userId, inviteId, inviteData: IInvite): Promise<any>;

	getUserInvites(userId, filters?, listParams?: IListParams): Promise<IInvitesListResponse>;

	addInvite(invite): Promise<IInvite>;

	getInvite(id): Promise<IInvite>;

	findInviteByCode(code): Promise<IInvite>;

	getJoinedByInviteCount(joinedByInviteId): Promise<number>;

	getUserInvitesCount(createdById, filters): Promise<number>;

	getAllInvites(filters, listParams: IListParams): Promise<IInvite[]>;

	getInvitedUserOfJoinedUser(userId): Promise<IUser>;

	getInviteOfJoinedUser(userId): Promise<IInvite>;

	getUsersListJoinedByInvite(inviteId): Promise<IUser[]>;

	getUsersListJoinedByUser(userId): Promise<IUser[]>;
}