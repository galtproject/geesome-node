import {preparedImageContract} from '../content/preparedImage.js';
export default function (app, service) {
    /**
     * @api {get} /v1/user/image-optimization/capabilities Image saving and retirement capabilities
     * @apiSuccess {Object} preparedImage Trusted-client multipart upload contract, slots and byte bounds.
     * @apiName ImageOptimizationCapabilities
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiSuccess {Number} contract Contract version, currently 1.
     * @apiSuccess {String} policy Current preferred rendition policy.
     * @apiSuccess {String[]} imagePolicies Supported explicit saving policies; legacy default remains publication-webp-v1.
     * @apiSuccess {Boolean} resave Existing save-data accepts sourceContentId and an imageOptimize driver.
     * @apiSuccess {Boolean} watermark Watermark driver is supported with optimization and frozen replacement receipts.
     * @apiSuccess {Boolean} retirement Local Kubo retirement adapter is supported.
     */
    app.ms.api.onAuthorizedGet('user/image-optimization/capabilities', async (req, res) => {
        await service.authorize(req.user.id, req.apiKey.id);
        res.send({...service.capabilities, preparedImage: preparedImageContract});
    });
    /**
     * @api {post} /v1/user/site-replacements Prepare site replacement receipt
     * @apiName SiteReplacementCreate
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiDescription Records an owned publication/source snapshot before resaving. This does not create an optimization batch: resave each file through user/save-data with sourceContentId and the same imageOptimize driver, using the existing operation queue. Requires content:write; deleteReplacedFiles additionally requires storage:retire. Replays reuse the owner/requestKey receipt; changed requests conflict.
     * @apiBody {String} requestKey Stable caller identity, up to 200 characters.
     * @apiBody {Object} driver imageOptimize convert driver with params.policy and optional params.watermark; normalized and frozen with this replacement.
     * @apiBody {Number[]} contentIds Ordered owned image IDs, 1..1000, no duplicates. For a previous site, keep the first occurrence of each ID; all old entries must still match the owned source CIDs.
     * @apiBody {String} [previousSiteStorageId] Exact replaced site CID.
     * @apiBody {Number} [postId] Existing owned membership publication, required with a previous site.
     * @apiBody {Boolean} [deleteReplacedFiles=false] Retire eligible old images, previews, site and archive after verified cutover.
     * @apiSuccess {Number} id Existing operation-queue ID.
     * @apiSuccess {String} status preparing
     * @apiError image_replacement_idempotency_conflict Request key was used with other inputs.
     * @apiError (503) storage_maintenance_busy Storage cleanup is active; this request has not executed. Retry with the same requestKey.
     */
    app.ms.api.onAuthorizedPost('user/site-replacements', async (req, res) => {
        res.send(await service.requestReplacement(req.user.id, req.body, req.apiKey.id), 202);
    });
    /**
     * @api {get} /v1/user/site-replacements/:id Get site replacement and cleanup receipt
     * @apiName SiteReplacementGet
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiParam {String} id Owned operation-queue ID.
     * @apiSuccess {String} status preparing, rendered, retiring, gc_pending, cleanup_failed, complete or complete_with_retained.
     * @apiSuccess {Object} result Saved image mapping, revision, cutover and per-file cleanup/GC receipts.
     */
    app.ms.api.onAuthorizedGet('user/site-replacements/:id', async (req, res) => {
        await service.authorize(req.user.id, req.apiKey.id);
        res.send(await service.status(req.user.id, Number(req.params.id)));
    });
    /**
     * @api {post} /v1/user/site-replacements/:id/finalize Verify cutover and queue optional retirement
     * @apiName SiteReplacementFinalize
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiParam {String} id Owned operation-queue ID.
     * @apiBody {String} storageId Exact replacement site CID.
     * @apiBody {Number} postId Owned upstream Post referencing the replacement root through text/uri-list Content, or the legacy membership page URL. Other IPFS link attachments are allowed.
     * @apiBody {Object} consumer Durable microwave-girls alias acknowledgment: kind, receiptId and mappingsHash; also bound in the Post metadata.
     * @apiDescription Verifies saved renderer receipt, ordered files, archive readiness, Post site-root reference, legacy image mapping when applicable, and consumer acknowledgment. The deletion flag is frozen at admission. Cleanup accumulates for one minute when idle or up to fifteen minutes behind foreground saves/renders/archives, then runs in a shared batch. Scheduling survives restarts and explicit cleanup retries bypass accumulation. Completion of GC is reported separately from publication success. Replays must match the original finalization.
     * @apiSuccess {String} status complete or retiring.
     * @apiError image_replacement_archive_not_ready Replacement archive is not complete.
     * @apiError image_replacement_publication_changed Post no longer matches the frozen replacement.
     */
    app.ms.api.onAuthorizedPost('user/site-replacements/:id/finalize', async (req, res) => {
        res.send(await service.finalize(req.user.id, Number(req.params.id), req.body, req.apiKey.id), 202);
    });
    /**
     * @api {post} /v1/user/site-replacements/:id/retry-cleanup Retry failed cleanup without rerendering
     * @apiName SiteReplacementRetryCleanup
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiParam {String} id Owned operation-queue ID.
     * @apiDescription Requires storage:retire and reuses persisted cleanup checkpoints. Resets the three-failure cleanup retry budget and resumes its persisted retirement or GC phase without rerendering. Publication and archive are checked again by the worker.
     * @apiSuccess {String} status retiring, gc_pending or current cleanup state.
     */
    app.ms.api.onAuthorizedPost('user/site-replacements/:id/retry-cleanup', async (req, res) => {
        res.send(await service.retryCleanup(req.user.id, Number(req.params.id), req.apiKey.id), 202);
    });
}
