import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import asyncBusboy from '../app/modules/content/asyncBusboy.js';

function multipart(payloads: Buffer[], chunked = false) {
	const boundary = 'regression-upload-boundary';
	const parts = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n/images\r\n`)];
	payloads.forEach((payload, index) => {
		parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image-${index}.png"\r\nContent-Type: image/png\r\n\r\n`), payload, Buffer.from('\r\n'));
	});
	parts.push(Buffer.from(`--${boundary}--\r\n`));
	const body = Buffer.concat(parts);
	const chunks = chunked ? Array.from({length: Math.ceil(body.length / 4096)}, (_, i) => body.subarray(i * 4096, (i + 1) * 4096)) : [body];
	return {request: Readable.from(chunks), options: {headers: {'content-type': `multipart/form-data; boundary=${boundary}`}}};
}

async function verifyUpload(payloads: Buffer[], chunked = false) {
	const {request, options} = multipart(payloads, chunked);
	const {files, fields} = await asyncBusboy(request, options);
	try {
		assert.equal(fields.path, '/images');
		assert.equal(files.length, payloads.length);
		for (let i = 0; i < files.length; i++) {
			const chunks = [];
			for await (const chunk of files[i]) {
				chunks.push(chunk);
			}
			assert.deepEqual(Buffer.concat(chunks), payloads[i], 'Disk bytes must match bytes received before the writer opened');
			assert.equal(files[i].bytes, payloads[i].length);
			assert.equal(files[i].sha256, createHash('sha256').update(payloads[i]).digest('hex'));
			assert.equal(files[i].filename, `image-${i}.png`);
		}
	} finally {
		for (const file of files) {
			file.destroy();
			await new Promise(resolve => file.emitFinish(resolve));
			await assert.rejects(fs.stat(file.tempPath), {code: 'ENOENT'});
		}
	}
}

describe('multipart upload byte preservation', () => {
	it('writes a small buffered image before returning its stream', async () => {
		await verifyUpload([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')]);
	});
	it('preserves separate small files in the same request', async () => {
		await verifyUpload([Buffer.from('first-image'), Buffer.from('second-image')]);
	});
	it('preserves a larger chunked file and its digest across backpressure', async () => {
		await verifyUpload([Buffer.alloc(512 * 1024, 0x5a)], true);
	});
	it('rejects a file exceeding its byte limit', async () => {
		const {request, options} = multipart([Buffer.alloc(2048)]);
		await assert.rejects(asyncBusboy(request, {...options, limits: {fileSize: 1024}}), {code: 'Request_file_size_limit', status: 413});
	});
});
