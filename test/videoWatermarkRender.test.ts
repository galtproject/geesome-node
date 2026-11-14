import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {normalizeVideoWatermark, videoGeometry, videoWatermarkPlacement, probeVideo, renderWatermarkedVideo} from '../app/modules/content/videoWatermarkRender.js';

const exec = promisify(execFile);
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="88" viewBox="0 0 400 88"><rect width="400" height="88" fill="red"/></svg>';
export async function testVideo(path) {
	await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=24:d=1',
		'-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path]);
}

describe('bounded video watermark renderer', function () {
	this.timeout(30000);
	it('rejects unsafe SVG, invalid identifiers and oversized/unknown media before encoding', () => {
		assert.throws(() => normalizeVideoWatermark({sourceContentId: -1, svg}));
		assert.throws(() => normalizeVideoWatermark({sourceContentId: 1, svg: svg.replace('<rect', '<image href="https://example.org/a"/><rect')}));
		assert.throws(() => normalizeVideoWatermark({sourceContentId: 1, svg: svg.replace('<rect', '<script>alert(1)</script><rect')}));
		const probe = {format: {duration: '1'}, streams: [{codec_type: 'video', width: 320, height: 240, avg_frame_rate: '24/1'}]};
		assert.equal(videoGeometry(probe).width, 320);
		for (const value of [{...probe, format: {duration: '181'}}, {...probe, streams: [{...probe.streams[0], width: 9000}]},
			{...probe, streams: [{...probe.streams[0], avg_frame_rate: '0/0'}]}, {...probe, streams: [{...probe.streams[0], sample_aspect_ratio: '4:3'}]}]) {
			assert.throws(() => videoGeometry(value));
		}
		assert.equal(videoGeometry({...probe, streams: [{...probe.streams[0], side_data_list: [{rotation: -90}]}]}).width, 240);
	});
	it('bakes a static mark on first and last frames, preserves AAC and source, and writes faststart MP4', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'video-render-test-'));
		try {
			const source = join(directory, 'source.mp4');
			await testVideo(source);
			const before = createHash('sha256').update(await readFile(source)).digest('hex');
			const result = await renderWatermarkedVideo(source, svg, directory);
			const probe = await probeVideo(result.path);
			assert.equal(probe.streams.find(track => track.codec_type === 'video').codec_name, 'h264');
			assert.equal(probe.streams.find(track => track.codec_type === 'video').pix_fmt, 'yuv420p');
			assert.equal(probe.streams.find(track => track.codec_type === 'audio').codec_name, 'aac');
			assert.deepEqual([result.width, result.height], [320, 240]);
			assert.ok(Math.abs(Number(probe.format.duration) - 1) < .1);
			const {stdout: originalAudio} = await exec('ffmpeg', ['-v', 'error', '-i', source, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-']);
			const {stdout: resultAudio} = await exec('ffmpeg', ['-v', 'error', '-i', result.path, '-map', '0:a:0', '-c', 'copy', '-f', 'hash', '-']);
			assert.equal(resultAudio, originalAudio);
			const placement = videoWatermarkPlacement(320, 240);
			for (const time of ['0', '0.9']) {
				const {stdout} = await exec('ffmpeg', ['-v', 'error', '-ss', time, '-i', result.path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], {encoding: 'buffer', maxBuffer: 1024 * 1024});
				const pixel = (x, y) => [...stdout.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)];
				assert.ok(pixel(placement.x + 15, placement.y + 10)[0] > 200, 'red watermark on every sampled frame');
				assert.ok(pixel(10, 10)[2] > 200, 'uncovered area stays blue');
			}
			const bytes = await readFile(result.path);
			assert.ok(bytes.indexOf('moov') < bytes.indexOf('mdat'));
			assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'), before);
			await renderWatermarkedVideo(source, svg.replace('red', '#ff0000'), directory);
			assert.notDeepEqual(await readFile(result.path), bytes, 'distinct SVG recipes retain distinct provenance even for identical visible pixels');
		} finally {
			await rm(directory, {recursive: true, force: true});
		}
	});
});
