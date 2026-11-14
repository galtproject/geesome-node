import {VideoWatermark} from './videoWatermark.js';
import {CorePermissionName} from '../database/interface.js';

export default function registerVideoWatermarkApi(app, module: VideoWatermark) {
	/**
	 * @api {post} /v1/user/video-watermarks Prepare watermarked video
	 * @apiName UserPrepareVideoWatermark
	 * @apiGroup Content
	 * @apiUse ApiKey
	 * @apiUse AuthErrors
	 * @apiDescription Requires UserSaveData and content:write. Accepts an owned local MP4, QuickTime or WebM up to 256 MiB, 180 seconds, 60 fps and 4096px per edge (8,847,360 pixels). Queues one bounded FFmpeg encode into H.264/yuv420p MP4 with faststart and AAC audio (existing AAC is copied). Original bytes remain unchanged. Existing unverified visual watermarks are preserved. SVG is allowlisted using image-composition rules. Placement is bottom-right with the image branding proportions. Source/style/profile receipts reuse completed results; matching version-1 videoWatermark provenance returns alreadyApplied=true without another overlay; at most eight recent styles are cached per source. Poll ordinary operation queue endpoints and read asyncOperation.output. Interrupted work can resume; an interrupted encode may run again. No external publication occurs.
	 * @apiBody {Number} sourceContentId Owned source video Content id.
	 * @apiBody {String} svg Self-contained SVG watermark in a 400:88 aspect ratio, with no external resources.
	 * @apiSuccess {String} status queued or completed.
	 * @apiSuccess {Number} sourceContentId Original Content id.
	 * @apiSuccess {Number} [id] Queue id; poll POST /v1/user/get-operation-queue/:id.
	 * @apiSuccess {Object} [content] Completed video/mp4 Content on cache reuse.
	 * @apiError (400) video_watermark_input_invalid Invalid source id.
	 * @apiError (400) video_watermark_svg_invalid Invalid or unsafe SVG.
	 * @apiError (403) video_watermark_content_unavailable Source is missing, private to another actor, remote, encrypted or deleted.
	 * @apiError (415) video_watermark_format_unsupported Unsupported container.
	 * @apiError (422) video_watermark_render_limit Media exceeds bounded rendering limits; limits discovered during probing appear in operation errors.
	 */
	app.ms.api.onAuthorizedPost('user/video-watermarks', async (req, res) => {
		await app.checkUserCan(req.user.id, CorePermissionName.UserSaveData);
		res.send(await module.request(req.user.id, req.apiKey.id, req.body));
	});
}
