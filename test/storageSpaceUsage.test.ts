/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import assert from "assert";
import {ContentMimeType, ContentStorageType, ContentView, CorePermissionName} from "../app/modules/database/interface.js";
import {IGeesomeApp} from "../app/interface.js";
import {PostStatus} from "../app/modules/group/interface.js";

describe("storage space usage", function () {
	this.timeout(60000);

	let app: IGeesomeApp;

	beforeEach(async () => {
		const appConfig = (await import('../app/config.js')).default;
		appConfig.storageConfig.jsNode.pass = 'test test test test test test test test test test';

		try {
			app = await (await import('../app/index.js')).default({storageConfig: appConfig.storageConfig, port: 7771});
			await app.flushDatabase();
			await app.setup({email: 'admin@admin.com', name: 'admin', password: 'admin'});
		} catch (e) {
			console.error('error', e);
			assert.equal(true, false);
		}
	});

	afterEach(async () => {
		await app.stop();
	});

	it("separates logical content bytes from deduplicated physical bytes", async () => {
		const before = await app.ms.storageSpace.getStorageSpaceOverview();
		const firstUser = await app.registerUser({
			email: 'user@user.com',
			name: 'user',
			password: 'user',
			permissions: [CorePermissionName.UserAll]
		});
		const secondUser = await app.registerUser({
			email: 'other@user.com',
			name: 'other',
			password: 'other',
			permissions: [CorePermissionName.UserAll]
		});
		const group = await app.ms.group.createGroup(firstUser.id, {
			name: 'usage',
			title: 'Usage'
		});

		const sharedContent = await app.ms.content.saveData(firstUser.id, 'shared-space-body', 'shared.txt', {
			mimeType: 'text/plain'
		});
		const duplicateContent = await app.ms.content.saveData(secondUser.id, 'shared-space-body', 'shared-copy.txt', {
			mimeType: 'text/plain'
		});
		const uniqueContent = await app.ms.content.saveData(firstUser.id, 'unique-space-body-extra', 'unique.txt', {
			mimeType: 'text/plain'
		});

		assert.equal(sharedContent.storageId, duplicateContent.storageId);
		await app.ms['fileCatalog'].saveContentByPath(firstUser.id, '/usage/shared.txt', sharedContent.id);
		await app.ms['fileCatalog'].saveContentByPath(firstUser.id, '/usage/deep/unique.txt', uniqueContent.id);
		const sharedPost = await app.ms.group.createPost(firstUser.id, {
			contents: [{id: sharedContent.id, view: ContentView.Attachment}],
			groupId: group.id,
			status: PostStatus.Published
		});
		await app.ms.database.markStorageObjectPinnedByContent(sharedContent);
		const pinAccount = await app.ms['pin'].createAccount(firstUser.id, {
			name: 'usage-pinata',
			service: 'pinata',
			apiKey: 'pinata-key',
			secretApiKey: 'pinata-secret',
		});
		await app.ms['pin'].recordPinnedStorageObject(sharedContent.storageId, pinAccount, sharedContent, {
			data: {IpfsHash: sharedContent.storageId}
		});
		await app.ms.database.updateContent(sharedContent.id, {peersCount: 3});
		await app.ms.database.models.Post.update({peersCount: 5, fullyPeersCount: 2}, {where: {id: sharedPost.id}});
		await app.ms.database.models.Group.update({peersCount: 7, fullyPeersCount: 4}, {where: {id: group.id}});
		const generatedStorageId = 'generated-space-output';
		const generatedSize = 33;
		const generatedUnknownContent = 'generated runtime output bytes';
		const previewContent = 'preview-space-body';
		const previewSize = Buffer.byteLength(previewContent);
		const generatedUnknownFile = await app.ms.storage.saveFileByData(generatedUnknownContent);
		const generatedUnknownDirectory = await saveGeneratedOutputDirectory(app);
		const previewFile = await app.ms.storage.saveFileByData(previewContent);
		await app.ms.database.models.StorageObject.create({
			storageId: generatedStorageId,
			storageType: 'ipfs',
			mimeType: 'text/html',
			extension: 'html',
			size: generatedSize,
		});
		await app.ms.database.updateContent(sharedContent.id, {
			smallPreviewStorageId: previewFile.id,
			smallPreviewSize: previewSize,
			previewMimeType: 'text/plain',
			previewExtension: 'txt',
		});
		await app.ms.database.syncStorageObject({
			storageId: previewFile.id,
			storageType: ContentStorageType.IPFS,
			mimeType: 'text/plain',
			extension: 'txt',
			size: previewSize,
		});
		await app.ms.database.sequelize.models.staticSite.create({
			name: 'usage-generated-site',
			title: 'Usage generated site',
			userId: firstUser.id,
			entityType: 'group',
			entityId: group.id.toString(),
			storageId: generatedStorageId,
			lastEntityManifestStorageId: group.manifestStorageId,
		});
		await app.ms.database.sequelize.models.staticSite.create({
			name: 'usage-runtime-generated-site',
			title: 'Usage runtime generated site',
			userId: firstUser.id,
			entityType: 'group',
			entityId: `${group.id}:runtime`,
			storageId: generatedUnknownFile.id,
		});
		await app.ms.database.sequelize.models.staticSite.create({
			name: 'usage-runtime-generated-directory',
			title: 'Usage runtime generated directory',
			userId: firstUser.id,
			entityType: 'group',
			entityId: `${group.id}:directory`,
			storageId: generatedUnknownDirectory.id,
		});

		const after = await app.ms.storageSpace.getStorageSpaceOverview();
		const sharedSize = Number(sharedContent.size);
		const duplicateSize = Number(duplicateContent.size);
		const uniqueSize = Number(uniqueContent.size);

		assert.equal(after.logicalContentBytes - before.logicalContentBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(after.physicalContentBytes - before.physicalContentBytes, sharedSize + uniqueSize);
		assert.equal(after.duplicateStorageIdsCount - before.duplicateStorageIdsCount, 1);
		assert.equal(after.duplicateContentRowsCount - before.duplicateContentRowsCount, 1);
		assert.equal(after.groupPostsLogicalBytes - before.groupPostsLogicalBytes, sharedSize);
		assert.equal(after.fileCatalogLogicalBytes > before.fileCatalogLogicalBytes, true);
		assert.equal(after.pinnedStorageObjectsCount - before.pinnedStorageObjectsCount, 1);
		assert.equal(after.pinnedPhysicalBytes - before.pinnedPhysicalBytes, sharedSize);
		assert.equal(after.remotePinnedStorageObjectsCount - before.remotePinnedStorageObjectsCount, 1);
		assert.equal(after.remotePinRefsCount - before.remotePinRefsCount, 1);
		assert.equal(after.generatedOutputKnownPhysicalBytes - before.generatedOutputKnownPhysicalBytes, generatedSize);
		assert.equal(after.generatedOutputKnownStorageObjectsCount - before.generatedOutputKnownStorageObjectsCount, 1);
		assert.equal(after.generatedOutputUniqueStorageIdsCount > before.generatedOutputUniqueStorageIdsCount, true);

		const typeBreakdown = await app.ms.storageSpace.getStorageSpaceTypeBreakdown({limit: 10});
		const textType = typeBreakdown.find(row => row.mimeType === 'text/plain');
		assert.equal(!!textType, true);
		assert.equal(textType?.logicalBytes, sharedSize + duplicateSize + uniqueSize);
		assert.equal(textType?.physicalBytes, sharedSize + uniqueSize);
		assert.equal(textType?.storageObjectsCount, 2);

		const topContents = await app.ms.storageSpace.getStorageSpaceTopContents({limit: 5});
		assert.equal(topContents.some(row => row.id === uniqueContent.id), true);
		assert.equal(topContents.every(row => Number.isFinite(row.size)), true);

		const topCatalogItems = await app.ms.storageSpace.getStorageSpaceTopFileCatalogItems({limit: 5});
		assert.equal(topCatalogItems.some(row => row.contentId === sharedContent.id), true);
		assert.equal(topCatalogItems.every(row => row.type === 'file'), true);

		const rootFolders = await app.ms.storageSpace.getStorageSpaceFileCatalogFolders({limit: 5});
		const usageFolder = rootFolders.find(row => row.name === 'usage');
		assert.equal(!!usageFolder, true);
		assert.equal(usageFolder?.logicalBytes, sharedSize + uniqueSize);
		assert.equal(usageFolder?.physicalBytes, sharedSize + uniqueSize);
		assert.equal(usageFolder?.filesCount, 2);
		assert.equal(usageFolder?.directFilesCount, 1);
		assert.equal(usageFolder?.childFoldersCount, 1);

		const childFolders = await app.ms.storageSpace.getStorageSpaceFileCatalogFolders({limit: 5, parentItemId: usageFolder.id});
		const deepFolder = childFolders.find(row => row.name === 'deep');
		assert.equal(!!deepFolder, true);
		assert.equal(deepFolder?.parentItemId, usageFolder?.id);
		assert.equal(deepFolder?.logicalBytes, uniqueSize);
		assert.equal(deepFolder?.physicalBytes, uniqueSize);
		assert.equal(deepFolder?.filesCount, 1);

		const topGroups = await app.ms.storageSpace.getStorageSpaceTopGroups({limit: 5});
		const usageGroup = topGroups.find(row => row.id === group.id);
		assert.equal(!!usageGroup, true);
		assert.equal(usageGroup?.size, sharedSize);

		const groupPosts = await app.ms.storageSpace.getStorageSpaceGroupPosts({limit: 5, groupId: group.id});
		const usagePost = groupPosts.find(row => row.id === sharedPost.id);
		assert.equal(!!usagePost, true);
		assert.equal(usagePost?.groupId, group.id);
		assert.equal(usagePost?.logicalBytes, sharedSize);
		assert.equal(usagePost?.attachmentLogicalBytes, sharedSize);
		assert.equal(usagePost?.physicalBytes, sharedSize);
		assert.equal(usagePost?.attachmentsCount, 1);
		assert.equal(usagePost?.storageObjectsCount, 1);

		const sharedStorageIds = await app.ms.storageSpace.getStorageSpaceSharedStorageIds({limit: 5});
		const sharedStorageIdRow = sharedStorageIds.find(row => row.storageId === sharedContent.storageId);
		assert.equal(!!sharedStorageIdRow, true);
		assert.equal(sharedStorageIdRow?.contentRowsCount, 2);
		assert.equal(sharedStorageIdRow?.usersCount, 2);
		assert.equal(sharedStorageIdRow?.logicalBytes, sharedSize + duplicateSize);
		assert.equal(sharedStorageIdRow?.physicalBytes, sharedSize);
		assert.equal(sharedStorageIdRow?.deduplicatedSavingsBytes, duplicateSize);
		assert.equal(sharedStorageIdRow?.activeFileCatalogRefsCount >= 1, true);
		assert.equal(sharedStorageIdRow?.groupPostRefsCount, 1);
		assert.equal(sharedStorageIdRow?.isPinned, true);

		const pinnedStorageObjects = await app.ms.storageSpace.getStorageSpacePinnedStorageObjects({limit: 5});
		const pinnedSharedObject = pinnedStorageObjects.find(row => row.storageId === sharedContent.storageId);
		assert.equal(!!pinnedSharedObject, true);
		assert.equal(pinnedSharedObject?.physicalBytes, sharedSize);
		assert.equal(pinnedSharedObject?.contentRowsCount, 2);
		assert.equal(pinnedSharedObject?.usersCount, 2);
		assert.equal(pinnedSharedObject?.activeFileCatalogRefsCount >= 1, true);
		assert.equal(pinnedSharedObject?.groupPostRefsCount, 1);
		assert.equal(pinnedSharedObject?.generatedOutputRefsCount, 0);
		assert.equal(pinnedSharedObject?.remotePinsCount, 1);
		assert.equal(pinnedSharedObject?.pinAccountsCount, 1);
		assert.equal(pinnedSharedObject?.pinServices, 'pinata');
		assert.equal(pinnedSharedObject?.isPinned, true);

		const previewStorage = await app.ms.storageSpace.getStorageSpacePreviewStorage({limit: 5});
		const smallPreviewRow = previewStorage.find(row => row.previewField === 'smallPreviewStorageId');
		assert.equal(!!smallPreviewRow, true);
		assert.equal(smallPreviewRow?.contentRowsCount, 1);
		assert.equal(smallPreviewRow?.storageObjectRowsCount, 1);
		assert.equal(smallPreviewRow?.uniqueStorageIdsCount, 1);
		assert.equal(smallPreviewRow?.registeredStorageObjectsCount, 1);
		assert.equal(smallPreviewRow?.unregisteredStorageIdsCount, 0);
		assert.equal(smallPreviewRow?.logicalPreviewBytes, previewSize);
		assert.equal(smallPreviewRow?.physicalPreviewBytes, previewSize);

		const availabilitySignals = await app.ms.storageSpace.getStorageSpaceAvailabilitySignals({limit: 10});
		const sharedSignal = availabilitySignals.find(row => row.storageId === sharedContent.storageId);
		assert.equal(!!sharedSignal, true);
		assert.equal(sharedSignal?.contentRowsCount, 2);
		assert.equal(sharedSignal?.usersCount, 2);
		assert.equal(sharedSignal?.activeFileCatalogRefsCount >= 1, true);
		assert.equal(sharedSignal?.groupPostRefsCount, 1);
		assert.equal(sharedSignal?.localPinRefsCount, 1);
		assert.equal(sharedSignal?.remotePinsCount, 1);
		assert.equal(sharedSignal?.pinAccountsCount, 1);
		assert.equal(sharedSignal?.pinServices, 'pinata');
		assert.equal(sharedSignal?.contentPeerRowsCount, 1);
		assert.equal(sharedSignal?.postPeerRowsCount, 1);
		assert.equal(sharedSignal?.maxContentPeersCount, 3);
		assert.equal(sharedSignal?.maxPostPeersCount, 5);
		assert.equal(sharedSignal?.maxPeerCount, 5);
		assert.equal(sharedSignal?.maxFullyPeerCount, 2);
		await app.ms.database.models.StorageSpaceAvailabilitySample.create({
			userId: firstUser.id,
			storageId: sharedContent.storageId,
			sampleJson: JSON.stringify({
				...sharedSignal,
				providerLookupOk: true,
				providersCount: 1,
				providersTruncated: false,
				providerLookupDurationMs: 12,
				providerLookupErrorMessage: null,
				providers: [{id: 'peer-a', multiaddrs: ['/ip4/127.0.0.1/tcp/4001'], protocols: [], source: 'test'}],
				retrievalStatOk: true,
				retrievalStatDurationMs: 8,
				retrievalType: 'file',
				retrievalMeasuredBytes: sharedSize,
				retrievalErrorMessage: null,
			}),
			providerLookupOk: true,
			providersCount: 1,
			providersTruncated: false,
			providerLookupDurationMs: 12,
			retrievalStatOk: true,
			retrievalStatDurationMs: 8,
			retrievalType: 'file',
			retrievalMeasuredBytes: sharedSize,
			sampledAt: new Date('2026-05-22T00:00:00.000Z'),
		});
		const availabilitySamples = await app.ms.storageSpace.getStorageSpaceAvailabilityNetworkSamples({
			storageId: sharedContent.storageId,
			offset: 99,
		});
		assert.equal(availabilitySamples.length, 1);
		assert.equal(availabilitySamples[0].storageId, sharedContent.storageId);
		assert.equal(availabilitySamples[0].userId, firstUser.id);
		assert.equal(availabilitySamples[0].providersCount, 1);
		assert.equal(availabilitySamples[0].providers[0].id, 'peer-a');
		assert.equal(availabilitySamples[0].retrievalMeasuredBytes, sharedSize);
		await app.ms.database.models.StorageSpaceAvailabilitySample.create({
			userId: null,
			storageId: 'bafy-old-availability-sample',
			sampleJson: JSON.stringify({
				storageId: 'bafy-old-availability-sample',
				providerLookupOk: false,
				providersCount: 0,
				providersTruncated: false,
				providerLookupErrorMessage: 'old sample',
				retrievalStatOk: false,
				retrievalMeasuredBytes: 0,
				retrievalErrorMessage: 'old sample',
			}),
			providerLookupOk: false,
			providersCount: 0,
			providersTruncated: false,
			retrievalStatOk: false,
			retrievalMeasuredBytes: 0,
			sampledAt: new Date('2026-01-01T00:00:00.000Z'),
		});
		const deletedOldSamples = await app.ms.storageSpace.cleanupStorageSpaceAvailabilityNetworkSamples({
			retentionDays: 30,
			now: new Date('2026-05-22T00:00:00.000Z'),
		});
		assert.equal(deletedOldSamples, 1);
		const oldAvailabilitySamples = await app.ms.storageSpace.getStorageSpaceAvailabilityNetworkSamples({
			storageId: 'bafy-old-availability-sample',
		});
		assert.equal(oldAvailabilitySamples.length, 0);
		const retainedAvailabilitySamples = await app.ms.storageSpace.getStorageSpaceAvailabilityNetworkSamples({
			storageId: sharedContent.storageId,
			offset: 99,
		});
		assert.equal(retainedAvailabilitySamples.length, 1);
		await app.ms.database.models.StorageSpaceAvailabilitySample.create({
			userId: null,
			storageId: sharedContent.storageId,
			sampleJson: JSON.stringify({
				...sharedSignal,
				providerLookupOk: false,
				providersCount: 4,
				providersTruncated: true,
				providerLookupDurationMs: 20,
				providerLookupErrorMessage: 'provider timeout',
				providers: [],
				retrievalStatOk: false,
				retrievalStatDurationMs: 15,
				retrievalType: null,
				retrievalMeasuredBytes: 0,
				retrievalErrorMessage: 'stat timeout',
			}),
			providerLookupOk: false,
			providersCount: 4,
			providersTruncated: true,
			providerLookupDurationMs: 20,
			providerLookupErrorMessage: 'provider timeout',
			retrievalStatOk: false,
			retrievalStatDurationMs: 15,
			retrievalMeasuredBytes: 0,
			retrievalErrorMessage: 'stat timeout',
			sampledAt: new Date('2026-05-23T00:00:00.000Z'),
		});
		const availabilitySampleSummary = await app.ms.storageSpace.getStorageSpaceAvailabilityNetworkSampleSummary({
			storageId: sharedContent.storageId,
			offset: 99,
		});
		assert.equal(availabilitySampleSummary.length, 1);
		assert.equal(availabilitySampleSummary[0].storageId, sharedContent.storageId);
		assert.equal(availabilitySampleSummary[0].samplesCount, 2);
		assert.equal(availabilitySampleSummary[0].providerLookupOkCount, 1);
		assert.equal(availabilitySampleSummary[0].retrievalStatOkCount, 1);
		assert.equal(availabilitySampleSummary[0].maxProvidersCount, 4);
		assert.equal(availabilitySampleSummary[0].latestUserId, null);
		assert.equal(availabilitySampleSummary[0].latestProviderLookupOk, false);
		assert.equal(availabilitySampleSummary[0].latestProvidersCount, 4);
		assert.equal(availabilitySampleSummary[0].latestProvidersTruncated, true);
		assert.equal(availabilitySampleSummary[0].latestProviderLookupErrorMessage, 'provider timeout');
		assert.equal(availabilitySampleSummary[0].latestRetrievalStatOk, false);
		assert.equal(availabilitySampleSummary[0].latestRetrievalErrorMessage, 'stat timeout');
		assert.equal(new Date(availabilitySampleSummary[0].firstSampledAt as any).toISOString(), '2026-05-22T00:00:00.000Z');
		assert.equal(new Date(availabilitySampleSummary[0].latestSampledAt as any).toISOString(), '2026-05-23T00:00:00.000Z');

		const cleanupBlockers = await app.ms.storageSpace.getStorageSpaceCleanupBlockers({contentId: sharedContent.id});
		assert.equal(cleanupBlockers.length, 1);
		const sharedCleanupRow = cleanupBlockers[0];
		assert.equal(sharedCleanupRow?.safeToDestroyContent, false);
		assert.equal(sharedCleanupRow?.safeToRemovePhysical, false);
		assert.equal(sharedCleanupRow?.contentRefs.posts, 1);
		assert.equal(sharedCleanupRow?.storageRefs.otherContents, 1);
		assert.equal(sharedCleanupRow?.storageRefs.pinnedStorageObjects, 1);
		assert.equal(sharedCleanupRow?.storageRefs.remotePinRefs, 1);
		assert.equal(sharedCleanupRow?.blockerCount, sharedCleanupRow?.blockers.length);
		assert.equal(hasStorageSpaceBlocker(sharedCleanupRow?.blockers, 'content', 'posts'), true);
		assert.equal(hasStorageSpaceBlocker(sharedCleanupRow?.blockers, 'content', 'fileCatalogItems'), true);
		assert.equal(hasStorageSpaceBlocker(sharedCleanupRow?.blockers, 'storage', 'otherContents'), true);
		assert.equal(hasStorageSpaceBlocker(sharedCleanupRow?.blockers, 'storage', 'pinnedStorageObjects'), true);
		assert.equal(hasStorageSpaceBlocker(sharedCleanupRow?.blockers, 'storage', 'remotePinRefs'), true);

		const generatedOutputs = await app.ms.storageSpace.getStorageSpaceGeneratedOutputs({limit: 20});
		const staticSiteOutput = generatedOutputs.find(row => row.source === 'staticSite.storageId');
		assert.equal(!!staticSiteOutput, true);
		assert.equal(staticSiteOutput?.knownPhysicalBytes, generatedSize);
		assert.equal(staticSiteOutput?.knownStorageObjectsCount, 1);
		assert.equal(staticSiteOutput?.unknownStorageIdsCount, 2);

		const generatedUnknownRefs = await app.ms.storageSpace.getStorageSpaceGeneratedOutputUnknownRefs({limit: 20});
		const staticSiteUnknownRef = generatedUnknownRefs.find(row => row.source === 'staticSite.storageId' && row.storageId === generatedUnknownFile.id);
		assert.equal(!!staticSiteUnknownRef, true);
		assert.equal(staticSiteUnknownRef?.storageRefsCount, 1);
		assert.equal(
			generatedUnknownRefs.some(row => row.source === 'staticSite.storageId' && row.storageId === generatedUnknownDirectory.id),
			true
		);

		const generatedInspections = await app.ms.storageSpace.inspectStorageSpaceGeneratedOutputRefs({limit: 20});
		const staticSiteInspection = generatedInspections.find(row => row.source === 'staticSite.storageId' && row.storageId === generatedUnknownFile.id);
		assert.equal(!!staticSiteInspection, true);
		assert.equal(staticSiteInspection?.ok, true);
		assert.equal(staticSiteInspection?.storageRefsCount, 1);
		assert.equal(staticSiteInspection?.measuredBytes >= generatedUnknownContent.length, true);

		const childInspections = await app.ms.storageSpace.inspectStorageSpaceGeneratedOutputChildRefs({
			storageId: generatedUnknownDirectory.id,
			childLimit: 10,
			depthLimit: 2,
			nodeLimit: 20,
		});
		const directoryChildInspection = childInspections[0];
		assert.equal(directoryChildInspection?.storageId, generatedUnknownDirectory.id);
		assert.equal(directoryChildInspection?.ok, true);
		assert.equal(directoryChildInspection?.childrenCount >= 3, true);
		assert.equal(directoryChildInspection?.inspectedChildrenCount >= 4, true);
		assert.equal(directoryChildInspection?.inspectedParentStorageIds.length >= 2, true);
		assert.equal(directoryChildInspection?.unknownChildrenCount >= 4, true);
		assert.equal(directoryChildInspection?.childMeasuredBytes > 0, true);
		assert.equal(directoryChildInspection?.children.some(child => child.name === 'index.html'), true);
		assert.equal(directoryChildInspection?.children.some(child => child.name === 'nested.txt' && child.depth === 2), true);

		const childReconcileResult = await app.ms.storageSpace.reconcileStorageSpaceGeneratedOutputChildRefs({
			storageId: generatedUnknownDirectory.id,
			childLimit: 10,
			depthLimit: 2,
			nodeLimit: 20,
		});
		assert.equal(childReconcileResult.inspectedParents, 1);
		assert.equal(childReconcileResult.inspectedChildren >= 4, true);
		assert.equal(childReconcileResult.reconciled >= 4, true);

		const reconciledChild = childReconcileResult.rows.find(row => row.name === 'index.html');
		assert.equal(!!reconciledChild?.storageObjectId, true);
		assert.equal(!!await app.ms.database.getStorageObjectByStorageId(reconciledChild.storageId), true);
		const reconciledNestedChild = childReconcileResult.rows.find(row => row.name === 'nested.txt');
		assert.equal(!!reconciledNestedChild?.storageObjectId, true);
		assert.equal(!!await app.ms.database.getStorageObjectByStorageId(reconciledNestedChild.storageId), true);
		const generatedChildContent = await app.ms.database.addContent({
			userId: firstUser.id,
			storageType: ContentStorageType.IPFS,
			mimeType: ContentMimeType.Text,
			storageId: reconciledNestedChild.storageId,
			size: reconciledNestedChild.measuredBytes,
			name: 'generated child reused content',
		});
		const generatedChildSafety = await app.ms.database.getContentDeleteSafety(generatedChildContent);
		assert.equal(generatedChildSafety.storageRefs.storageObjectChildRefs, 1);
		assert.equal(hasStorageSpaceBlocker(generatedChildSafety.blockers, 'storage', 'storageObjectChildRefs'), true);
		assert.equal(generatedChildSafety.safeToDestroyContent, true);
		assert.equal(generatedChildSafety.safeToRemovePhysical, false);
		const afterGeneratedChildContent = await app.ms.storageSpace.getStorageSpaceOverview();
		assert.equal(
			afterGeneratedChildContent.logicalContentBytes - after.logicalContentBytes,
			Number(generatedChildContent.size)
		);

		const reconcileResult = await app.ms.storageSpace.reconcileStorageSpaceGeneratedOutputRefs({limit: 20});
		const reconciledStaticSiteOutput = reconcileResult.rows.find(row => row.source === 'staticSite.storageId' && row.storageId === generatedUnknownFile.id);
		assert.equal(!!reconciledStaticSiteOutput, true);
		assert.equal(reconciledStaticSiteOutput?.reconciled, true);
		assert.equal(reconcileResult.reconciled >= 1, true);

		const reconciledStorageObject = await app.ms.database.getStorageObjectByStorageId(generatedUnknownFile.id);
		assert.equal(!!reconciledStorageObject, true);
		assert.equal(Number(reconciledStorageObject.size) >= generatedUnknownContent.length, true);

		const generatedOutputsAfterReconcile = await app.ms.storageSpace.getStorageSpaceGeneratedOutputs({limit: 20});
		const staticSiteOutputAfterReconcile = generatedOutputsAfterReconcile.find(row => row.source === 'staticSite.storageId');
		assert.equal(staticSiteOutputAfterReconcile?.knownStorageObjectsCount, 3);
		assert.equal(staticSiteOutputAfterReconcile?.unknownStorageIdsCount, 0);

		assert.equal(await app.ms.storageSpace.getLatestStorageSpaceSnapshot(), null);
		const snapshot = await app.ms.storageSpace.refreshStorageSpaceSnapshot(firstUser.id, {limit: 2, offset: 99});
		assert.equal(snapshot.userId, firstUser.id);
		assert.equal(snapshot.listLimit, 2);
		assert.equal(snapshot.data.overview.logicalContentBytes, afterGeneratedChildContent.logicalContentBytes);
		assert.equal(snapshot.data.typeBreakdown.length <= 2, true);
		assert.equal(snapshot.data.topContents.length <= 2, true);
		assert.equal(snapshot.data.topFileCatalogItems.length <= 2, true);
		assert.equal(snapshot.data.fileCatalogFolders.length <= 2, true);
		assert.equal(snapshot.data.topGroups.length <= 2, true);
		assert.equal(snapshot.data.groupPosts.length <= 2, true);
		assert.equal(snapshot.data.generatedOutputs.length <= 2, true);
		assert.equal(snapshot.data.sharedStorageIds.length <= 2, true);
		assert.equal(snapshot.data.pinnedStorageObjects.length <= 2, true);
		assert.equal(snapshot.data.previewStorage.length <= 2, true);
		assert.equal(snapshot.data.availabilitySignals.length <= 2, true);

		const progressEvents = [];
		const progressSnapshotData = await app.ms.storageSpace.getStorageSpaceSnapshotData({limit: 1, offset: 99}, {
			onProgress: (progress) => progressEvents.push(progress)
		});
		assert.deepEqual(progressEvents.map(event => event.stage), [
			'overview',
			'type-breakdown',
			'top-contents',
			'top-file-catalog-items',
			'file-catalog-folders',
			'top-groups',
			'group-posts',
			'generated-outputs',
			'shared-storage-ids',
			'pinned-storage-objects',
			'preview-storage',
			'availability-signals',
		]);
		assert.equal(progressEvents[0].percent > 1, true);
		assert.equal(progressEvents[progressEvents.length - 1].percent, 95);
		assert.equal(progressSnapshotData.topContents.length <= 1, true);
		assert.equal(progressSnapshotData.availabilitySignals.length <= 1, true);

		const latestSnapshot = await app.ms.storageSpace.getLatestStorageSpaceSnapshot();
		assert.equal(latestSnapshot.id, snapshot.id);
		assert.deepEqual(latestSnapshot.data.overview, snapshot.data.overview);

		const queuedRefresh = await app.ms.storageSpace.queueStorageSpaceSnapshotRefresh(firstUser.id, null, {limit: 1, offset: 99}, {process: false});
		assert.equal(queuedRefresh.module, "storage-space-snapshot");
		assert.equal(queuedRefresh.isWaiting, true);

		assert.deepEqual(await app.ms.storageSpace.processStorageSpaceSnapshotRefreshQueue({limit: 1}), {processed: 1});
		const processedQueue = await app.ms.asyncOperation.getUserOperationQueue(firstUser.id, queuedRefresh.id);
		assert.equal(processedQueue.isWaiting, false);
		assert.equal(processedQueue.asyncOperation.inProcess, false);
		assert.equal(processedQueue.asyncOperation.percent, 100);

		const queuedRefreshOutput = JSON.parse(processedQueue.asyncOperation.output);
		const queuedSnapshot = await app.ms.storageSpace.getLatestStorageSpaceSnapshot();
		assert.equal(queuedRefreshOutput.snapshotId, queuedSnapshot.id);
		assert.equal(queuedSnapshot.listLimit, 1);
		assert.equal(queuedSnapshot.data.topContents.length <= 1, true);

		const growthBaselineSnapshot = await app.ms.storageSpace.getLatestStorageSpaceSnapshot();
		const growthContentBody = 'growth-space-body';
		const growthContent = await app.ms.content.saveData(firstUser.id, growthContentBody, 'growth.txt', {
			mimeType: 'text/plain'
		});
		const growthSnapshot = await app.ms.storageSpace.refreshStorageSpaceSnapshot(firstUser.id, {limit: 2});
		const snapshotGrowth = await app.ms.storageSpace.getStorageSpaceSnapshotGrowth({sinceDays: 0});
		const logicalContentGrowth = snapshotGrowth.overview.find(row => row.key === 'logicalContentBytes');
		const logicalContentSectionGrowth = snapshotGrowth.sections.find(row => row.key === 'logical-content');
		const snapshotHistory = await app.ms.storageSpace.getStorageSpaceSnapshotHistory({limit: 2});
		assert.equal(snapshotGrowth.latestSnapshot.id, growthSnapshot.id);
		assert.equal(snapshotGrowth.baselineSnapshot.id, growthBaselineSnapshot.id);
		assert.equal(snapshotGrowth.usedFallbackBaseline, false);
		assert.equal(logicalContentGrowth.delta, Number(growthContent.size));
		assert.equal(logicalContentSectionGrowth.delta, Number(growthContent.size));
		assert.equal(snapshotHistory.length, 2);
		assert.equal(snapshotHistory[0].id, growthSnapshot.id);
		assert.equal(snapshotHistory[0].listLimit, 2);
		assert.equal(Object.prototype.hasOwnProperty.call(snapshotHistory[0], 'data'), false);
	});
});

async function saveGeneratedOutputDirectory(app: IGeesomeApp) {
	const dirPath = `/storage-space-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const indexFile = await app.ms.storage.saveFileByData('<html>generated child</html>');
	const assetFile = await app.ms.storage.saveFileByData('generated asset child');
	const nestedFile = await app.ms.storage.saveFileByData('nested generated asset child');
	await app.ms.storage.makeDir(dirPath);
	await app.ms.storage.makeDir(`${dirPath}/nested`);
	await app.ms.storage.copyFileFromId(indexFile.id, `${dirPath}/index.html`);
	await app.ms.storage.copyFileFromId(assetFile.id, `${dirPath}/asset.txt`);
	await app.ms.storage.copyFileFromId(nestedFile.id, `${dirPath}/nested/nested.txt`);
	return {id: await app.ms.storage.getDirectoryId(dirPath)};
}

function hasStorageSpaceBlocker(blockers, scope, key) {
	return (blockers || []).some(blocker => blocker.scope === scope && blocker.key === key);
}
