import {digest, sameCid} from '../../storageIdentity.js';
import {pageCid, readSiteData} from './siteData.js';
import {problem} from '../content/publicationInput.js';

export async function finalizeReplacement(service, userId, id, body, apiKeyId = null) {
    const row = await service.replacement(userId, id);
    await service.authorize(userId, apiKeyId, row.input.deleteReplacedFiles);
    const cid = pageCid(`https://local.invalid/ipfs/${body.storageId}/`);
    const receipt = {storageId: cid, postId: Number(body.postId), consumer: body.consumer};
    const hash = digest(receipt);
    if (row.result?.finalization) {
        if (row.result.finalization.hash !== hash) {
            problem('image_replacement_finalize_conflict');
        }
        return service.status(userId, id);
    }
    if (row.status !== 'rendered' || !sameCid(cid, row.result?.storageId)) {
        problem('image_replacement_render_not_ready');
    }
    const post = await service.publication(userId, receipt.postId);
    const metadata = service.membership(post);
    const ids = row.result.images.map(item => item.content.id);
    const attachments = [...post.contents].sort((a, b) => Number(a.postsContents?.position || 0) - Number(b.postsContents?.position || 0));
    if (!sameCid(pageCid(metadata.pageUrl), cid) || JSON.stringify(attachments.map(c => c.id)) !== JSON.stringify(ids)
        || (row.input.previous && (post.id !== row.input.previous.postId || metadata.sourceKey !== row.input.previous.sourceKey))) {
        problem('image_replacement_publication_changed');
    }
    const mapping = row.result.images.map(item => [String(item.sourceContentId), String(item.content.id),
        item.sourceManifestStorageId, item.content.manifestStorageId]);
    const consumer = receipt.consumer;
    if (!consumer || consumer.kind !== 'microwave-girls' || typeof consumer.receiptId !== 'string'
        || consumer.mappingsHash !== digest(mapping)
        || Number(metadata.imageReplacement?.id) !== row.id
        || metadata.imageReplacement?.receiptId !== consumer.receiptId
        || metadata.imageReplacement?.mappingsHash !== consumer.mappingsHash) {
        problem('image_replacement_consumer_not_ready');
    }
    const page = await readSiteData(service.app.ms.storage, cid);
    if (JSON.stringify(page.contents?.map(c => Number(c.id))) !== JSON.stringify(ids)
        || page.contents.some((c, i) => !sameCid(c.storageId, row.result.images[i].content.storageId))) {
        problem('image_replacement_render_mismatch');
    }
    const archive = await service.app.ms.archive.getArchive(cid);
    if (!archive) {
        problem('image_replacement_archive_not_ready');
    }
    await service.app.ms.storage.getFileStat(archive.archivedStorageId);
    await service.app.ms.storage.addPin(cid);
    await service.app.ms.storage.addPin(archive.archivedStorageId);
    const finalization = {...receipt, hash, archiveStorageId: archive.archivedStorageId,
        postHash: digest({metadata, contentIds: attachments.map(c => c.id)})};
    await row.update({status: row.input.deleteReplacedFiles ? 'retiring' : 'complete',
        result: {...row.result, finalization}});
    return service.status(userId, id);
}


export async function assertCurrentPublication(service, row) {
    const final = row.result.finalization;
    const post = await service.publication(row.userId, final.postId);
    const metadata = service.membership(post);
    const ids = [...post.contents].sort((a, b) => Number(a.postsContents?.position || 0) - Number(b.postsContents?.position || 0)).map(c => c.id);
    if (!sameCid(pageCid(metadata.pageUrl), final.storageId) || digest({metadata, contentIds: ids}) !== final.postHash) {
        problem('image_replacement_publication_changed');
    }
    if (!await service.app.ms.archive.getArchive(final.storageId)) {
        problem('image_replacement_archive_not_ready');
    }
    return post;
}
