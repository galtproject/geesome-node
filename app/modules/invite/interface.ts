import {IInvite, IListParams, IUser, IUserApiKey} from "../database/interface";
import {IInvitesListResponse, IUserInput} from "../../interface";

export default interface IGeesomeInviteModule {
	registerUserByInviteCode(inviteCode: string, userData: IUserInput): Promise<{user: IUser, apiKey: IUserApiKey}>;

	createInvite(userId, inviteData: IInvite): Promise<IInvite>;

	updateInvite(userId, inviteId, inviteData: IInvite): Promise<any>;

	getUserInvites(userId, filters?, listParams?: IListParams): Promise<IInvitesListResponse>;
}