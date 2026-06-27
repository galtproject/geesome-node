import {IInvite, IListParams, IUser} from "../database/interface.js";
import {IInvitesListResponse, IUserInput} from "../../interface.js";

export type IInviteStatusOptions = {
	requiredPermission?: string | null;
};

export type IInviteStatusResponse = {
	ok: true;
	code: string;
	publicJoinEnabled: true;
	active: true;
	remainingUses: number;
	permissions: string[];
	requiredPermission?: string;
	expiresAt: null;
	joinPath: string;
};

export type IInviteJoinResponse = {
	user: IUser;
	apiKey: string;
	permissions: string[];
	keyStoreMethod: 'node';
};

export default interface IGeesomeInviteModule {
	registerUserByInviteCode(inviteCode: string, userData: IUserInput): Promise<IInviteJoinResponse>;

	getInviteStatus(inviteCode: string, options?: IInviteStatusOptions): Promise<IInviteStatusResponse>;

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

	getRegisterMessage(inviteCode): Promise<string>;
}
