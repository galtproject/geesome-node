import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {stat, writeFile} from 'node:fs/promises';
import {validateAndNormalizeImageCompositionStickerSvg} from '../imageComposition/svg.js';
import {problem} from './publicationInput.js';

const exec = promisify(execFile);
export const videoWatermarkPolicy = 'video-svg-h264-v1';
export const maxVideoBytes = 256 * 1024 * 1024;

export function normalizeVideoWatermark(input) {
	if (!Number.isSafeInteger(input?.sourceContentId) || input.sourceContentId <= 0) {
		problem('video_watermark_input_invalid', 400);
	}
	try {
		const {svg, svgHash} = validateAndNormalizeImageCompositionStickerSvg(input.svg);
		return {sourceContentId: input.sourceContentId, svg, svgHash, policy: videoWatermarkPolicy};
	} catch {
		problem('video_watermark_svg_invalid', 400);
	}
}

export async function probeVideo(path: string, format = 'mov') {
	const {stdout} = await exec('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-f', format, '-show_streams', '-show_format', '-of', 'json', path],
		{timeout: 30000, maxBuffer: 1024 * 1024});
	return JSON.parse(stdout);
}

export function videoGeometry(probe) {
	const video = probe.streams?.find(track => track.codec_type === 'video' && !track.disposition?.attached_pic);
	const duration = Number(probe.format?.duration);
	const [numerator, denominator] = String(video?.avg_frame_rate || '').split('/').map(Number);
	const fps = numerator / denominator;
	const rotation = Number(video?.side_data_list?.find(data => data.rotation !== undefined)?.rotation || video?.tags?.rotate || 0);
	const rotated = Math.abs(rotation % 180) === 90;
	const width = Number(rotated ? video?.height : video?.width);
	const height = Number(rotated ? video?.width : video?.height);
	if (probe.streams.filter(track => track.codec_type === 'video').length !== 1 || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 32 || height < 32
		|| width > 4096 || height > 4096 || width * height > 8_847_360
		|| !Number.isFinite(duration) || duration <= 0 || duration > 180
		|| !Number.isFinite(fps) || fps <= 0 || fps > 60 || duration * fps > 10800
		|| ![0, 90, 180, 270].includes((rotation % 360 + 360) % 360)
		|| video.sample_aspect_ratio && !['1:1', '0:1', 'N/A'].includes(video.sample_aspect_ratio)) {
		problem('video_watermark_render_limit', 422);
	}
	return {width, height, duration, fps, audio: probe.streams.some(track => track.codec_type === 'audio')};
}

export function videoWatermarkPlacement(width: number, height: number) {
	const plateWidth = Math.max(1, Math.floor(Math.min(width * .35, height * 1.2, 400)));
	const plateHeight = Math.max(1, Math.round(plateWidth * 88 / 400));
	const margin = Math.floor(Math.min(width, height) * .02);
	const bottom = Math.min(height - plateHeight, Math.max(margin, Math.round(height * .06)));
	return {width: plateWidth, height: plateHeight, x: width - plateWidth - margin, y: height - plateHeight - bottom};
}

export async function renderWatermarkedVideo(inputPath: string, svg: string, directory: string, mimeType = 'video/mp4', sourceIdentity = '') {
	const format = mimeType === 'video/webm' ? 'matroska,webm' : 'mov';
	const probe = await probeVideo(inputPath, format);
	const geometry = videoGeometry(probe);
	const placement = videoWatermarkPlacement(geometry.width, geometry.height);
	const png = `${directory}/watermark.png`, output = `${directory}/branded.mp4`;
	await writeFile(png, await sharp(Buffer.from(svg), {limitInputPixels: 4_000_000})
		.resize(placement.width, placement.height, {fit: 'fill'}).png().toBuffer(), {mode: 0o600});
	const signature = createHash('sha256').update(JSON.stringify([videoWatermarkPolicy, sourceIdentity, svg])).digest('hex');
	const audio = probe.streams.find(track => track.codec_type === 'audio');
	await exec('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-protocol_whitelist', 'file,pipe', '-f', format, '-i', inputPath,
		'-i', png, '-filter_complex_threads', '1', '-filter_complex',
		`[0:v:0][1:v:0]overlay=${placement.x}:${placement.y}:format=auto,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p[v]`,
		'-map', '[v]', '-map', '0:a:0?', '-map_metadata', '-1', '-map_chapters', '-1',
		'-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2',
		'-metadata', `comment=${videoWatermarkPolicy}:${signature}`,
		'-c:a', audio?.codec_name === 'aac' ? 'copy' : 'aac', '-movflags', '+faststart', output],
		{timeout: 600000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024});
	if ((await stat(output)).size > maxVideoBytes) {
		problem('video_watermark_render_limit', 422);
	}
	return {path: output, width: Math.ceil(geometry.width / 2) * 2,
		height: Math.ceil(geometry.height / 2) * 2, duration: geometry.duration};
}
