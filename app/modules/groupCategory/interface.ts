import {IGroup, IGroupListResponse, IPostListResponse} from "../group/interface";
import {IGroupSectionListResponse} from "../../interface";
import {IContent, IListParams, IUser} from "../database/interface";

export default interface IGeesomeGroupCategoryModule {
	getCategoryByParams(params): Promise<IGroupCategory>;

	createCategory(userId, categoryData): Promise<IGroupCategory>;

	addGroupToCategory(userId, groupId, categoryId): Promise<void>;

	addGroupToCategoryMembership(userId, groupId, categoryId): Promise<void>;

	getCategoriesMembershipOfGroup(groupId): Promise<IGroupCategory>;

	getCategoryGroups(userId, categoryId, filters?, listParams?: IListParams): Promise<IGroupListResponse>;

	getCategoryPosts(categoryId, filters?, listParams?: IListParams): Promise<IPostListResponse>;

	createGroupSection(userId, groupSectionData): Promise<IGroupSection>;

	updateGroupSection(userId, groupSectionId, groupSectionData): Promise<IGroupSection>;

	getGroupSectionItems(filters?, listParams?: IListParams): Promise<IGroupSectionListResponse>;

	addMemberToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

	addAdminToCategory(userId, categoryId, memberId, groupPermissions?: string[]): Promise<void>;

	removeMemberFromCategory(userId, categoryId, memberId): Promise<void>;

	isMemberInCategory(userId, categoryId): Promise<boolean>;

	getGroupSection(sectionId): Promise<IGroupSection>;

	getGroupSections(filters?, listParams?): Promise<IGroupSection[]>;

	getGroupSectionsCount(filters?): Promise<number>;

	setSectionOfGroup(userId, groupId, sectionId): Promise<any>;

	getCategory(categoryId): Promise<IGroupCategory>;

	getCategoryByParams(params: {name?, staticStorageId?, manifestStorageId?, manifestStaticStorageId?}): Promise<IGroupCategory>;

	addCategory(category): Promise<IGroupCategory>;

	updateCategory(id, updateData): Promise<void>;

	removeAdminFromCategory(userId, categoryId): Promise<void>;

	removeGroupFromCategory(groupId, categoryId): Promise<void>;

	isAdminInCategory(userId, categoryId): Promise<boolean>;

	isMemberInCategory(userId, categoryId): Promise<boolean>;

	getCategoryPostsCount(categoryId, filters?): Promise<number>;

	getCategoryGroupsCount(categoryId, filters?): Promise<number>;
}

export interface IGroupSection {
	id: number;

	name: string;
	title: string;

	description?: string;
	creatorId: number;
	categoryId: number;
	avatarImageId?: number;
	avatarImage?: IContent;
	coverImageId?: number;
	coverImage?: IContent;
	isGlobal?: boolean;
	storageId?: string;
	staticStorageId?: string;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;
}

export interface IGroupCategory {
	id: number;

	name: string;
	title: string;

	description?: string;
	creatorId: number;
	avatarImageId?: number;
	avatarImage?: IContent;
	coverImageId?: number;
	coverImage?: IContent;
	isGlobal?: boolean;
	storageId?: string;
	staticStorageId?: string;
	manifestStorageId?: string;
	manifestStaticStorageId?: string;

	addAdministrators?(users: IUser[]);
	removeAdministrators?(users: IUser[]);
	setAdministrators?(users: IUser[]);
	getAdministrators?(options): IUser[];
	countAdministrators?(): number;

	addGroups?(users: IGroup[]);
	removeGroups?(users: IGroup[]);
	setGroups?(users: IGroup[]);
	getGroups?(options): IGroup[];
	countGroups?(options?): number;

	addMembershipGroups?(users: IGroup[]);
	removeMembershipGroups?(users: IGroup[]);
	setMembershipGroups?(users: IGroup[]);
	getMembershipGroups?(options): IGroup[];
	countMembershipGroups?(options?): number;

	addMembers?(users: IUser[]);
	removeMembers?(users: IUser[]);
	getMembers?(options): IUser[];
	countMembers?(options?): number;
}
