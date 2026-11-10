import _ from 'lodash';
import IGeesomeStaticSiteGeneratorModule from "./interface.js";
import {IGeesomeApp} from "../../interface.js";
import helpers from "../../helpers.js";
const {pick} = _;


export default (app: IGeesomeApp, ssgModule: IGeesomeStaticSiteGeneratorModule) => {
	const api = app.ms.api.prefix('render/static-site-generator/');

	api.onAuthorizedPost('get-default-options', async (req, res) => {
		return res.send(await ssgModule.getDefaultOptionsByRenderArgs(req.user.id, pickRenderArgs(req.body)), 200);
	});
	api.onAuthorizedPost('update-info/:id', async (req, res) => {
		return res.send(await ssgModule.updateStaticSiteInfo(req.user.id, req.params.id, req.body), 200);
	});
	api.onAuthorizedPost('get-info', async (req, res) => {
		return res.send(await ssgModule.getStaticSiteInfo(req.user.id, pickRenderArgs(req.body)), 200);
	});
	/**
	 * @api {post} /v1/render/static-site-generator/get-list List owned static sites
	 * @apiName StaticSiteGetList
	 * @apiGroup StaticSiteGenerator
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription SQL metadata lookup scoped to the authenticated owner; does not wait for storage writer capacity or GC.
	 * @apiBody {String} [entityType] Optional source type filter.
	 * @apiBody {Number} [limit] Page size.
	 * @apiBody {Number} [offset] Page offset.
	 * @apiSuccess {Object[]} list Owned static sites.
	 * @apiSuccess {Number} total Owned site count.
	 */
	api.onAuthorizedPost('get-list', async (req, res) => {
		return res.send(await ssgModule.getStaticSiteResponse(req.user.id, req.body.entityType, helpers.prepareListParams(req.body)), 200);
	}, {storageReadOnly: true});
	/**
	 * @api {post} /v1/render/static-site-generator/run Generate a static site
	 * @apiName StaticSiteGenerate
	 * @apiGroup StaticSiteGenerator
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiBody {String="group","content-list"} entityType Source type.
	 * @apiBody {String} [entityId] Group id for group rendering.
	 * @apiBody {Number[]} [entityIds] Ordered content ids for content-list rendering.
	 * @apiBody {Object} [options] Render options.
	 * @apiBody {Boolean} [options.archive=false] Queue a public tar.gz archive after rendering and show its top-right download control. Requires archive module and save permission. Rendering does not wait for compression. Generated controls use /api/v1/archive on the current page origin; gateway hosts must proxy that API path.
	 * @apiSuccess {Number} id Render queue id; poll the existing user operation-queue endpoint.
	 */
	api.onAuthorizedPost('run', async (req, res) => {
		return res.send(await ssgModule.addRenderToQueueAndProcess(req.user.id, req.apiKey.id, pickRenderArgs(req.body), req.body.options), 200);
	});
    /**
     * @api {post} /v1/render/static-site-generator/recover/:id Recover a restart-interrupted content-list render
     * @apiName StaticSiteRecover
     * @apiGroup StaticSiteGenerator
     * @apiUse ApiKey
     * @apiUse AuthErrors
     * @apiParam {Number} id Original owned render queue id.
     * @apiBody {Number} expectedOperationId Exact interrupted operation id from the original receipt.
     * @apiBody {Boolean} [retainOriginalForExternalLinks=false] Establish an owned retained Page/archive/MFS reference before admitting a replacement recovery while external links still use the old URL. Requires the queue policy's retention capability. The same recovery identity must retain the same flag. Generic unproven previous roots are refused.
     * @apiDescription Requires content:write and save permission. Content-list renders stopped by node-restart are eligible when they have a replacement receipt, frozen owned-source snapshot, or exactly correlated legacy saved result. Poll the original queue's renderRecoveryPolicy before recovery; unproven legacy input and group renders require review. The original queue/input and interrupted operation remain unchanged; a new attempt is attached to the same queue. At most three recovery attempts are accepted per queue. Repeating the same expectedOperationId returns the accepted attempt without replaying it. Saved output is adopted instead of rerendering; archive admission is reconciled before completion. Other errors, cancellation, changed sources/operation or exhausted budget require review.
     * @apiSuccess {Number} id Original render queue id.
     * @apiSuccess {Number} asyncOperationId Current render operation id.
     * @apiSuccess {Object} asyncOperation Current operation receipt.
     * @apiSuccess {Object} recovery Accepted attempt id, interrupted/current operation ids, state and limit.
     * @apiError static_site_recovery_not_interrupted Operation is active, complete, cancelled or failed for another reason.
     * @apiError static_site_recovery_operation_changed Queue no longer points to the expected interrupted operation.
     * @apiError static_site_recovery_exhausted Three recovery attempts were already accepted.
     * @apiError static_site_recovery_retention_conflict The same recovery identity was used with another external-link retention choice.
     * @apiError static_site_recovery_retention_requires_replacement No owned frozen previous-site replacement receipt exists for the requested hold.
     */
    api.onAuthorizedPost('recover/:id', async (req, res) => {
        return res.send(await ssgModule.recoverRenderQueue(req.user.id, Number(req.params.id),
            req.body.expectedOperationId, req.apiKey.id, {retainOriginalForExternalLinks: req.body.retainOriginalForExternalLinks}), 202);
    });
	api.onAuthorizedPost('bind-to-static-id/:id', async (req, res) => {
		return res.send(await ssgModule.bindSiteToStaticId(req.user.id, req.params.id), 200);
	});
}

function pickRenderArgs(data) {
	return pick(data, ['entityType', 'entityId', 'entityIds'])
}
