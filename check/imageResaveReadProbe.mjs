// Read-only probe: no application bootstrap, DB, uploads, pinning or publication.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {performance} from 'node:perf_hooks';
import {parseArgs} from 'node:util';
import sharp from 'sharp';

async function measured(action) {
    const start = performance.now(), cpu = process.cpuUsage();
    const value = await action();
    const used = process.cpuUsage(cpu);
    return {value, wallMs: performance.now() - start, cpuMs: (used.user + used.system) / 1000};
}
async function readSource(cid, {gateway, kuboUrl}) {
    const url = new URL(kuboUrl ? '/api/v0/cat' : '/ipfs/' + cid, kuboUrl || gateway);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error('probe_origin_invalid');
    }
    if (kuboUrl) {
        url.searchParams.set('arg', cid);
    }
    const response = await fetch(url, {method: kuboUrl ? 'POST' : 'GET', headers: {'User-Agent': 'Mozilla/5.0'},
        redirect: 'error', signal: AbortSignal.timeout(60000)});
    if (!response.ok) {
        throw new Error('probe_read_http_' + response.status);
    }
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 64 * 1024 * 1024) {
            throw new Error('probe_source_too_large');
        }
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
export async function runImageResaveReadProbe(sources, options = {}) {
    const {gateway = 'https://eraofmeat.com', kuboUrl} = options;
    if (!Array.isArray(sources) || sources.length < 1 || sources.length > 3
        || sources.some(s => !/^[A-Za-z0-9]{30,100}$/.test(s.storageId))) {
        throw new Error('probe_sources_invalid');
    }
    const {encodePublicationImage} = await import(pathToFileURL(path.resolve('app/modules/drivers/convert/imageOptimize.ts')).href);
    const {ImagePreviewDriver} = await import(pathToFileURL(path.resolve('app/modules/drivers/preview/image.ts')).href);
    const results = [];
    for (const source of sources) {
        const read = await measured(() => readSource(source.storageId, {gateway, kuboUrl}));
        const metadata = await sharp(read.value).metadata();
        const trials = [];
        for (let repeat = 0; repeat < 2; repeat++) {
            const jpeg = await measured(() => encodePublicationImage(Readable.from([read.value]), null, false, 'publication-jpeg95-v1'));
            const seen = new Set(), previews = [];
            for (const [size, edge] of [['medium', 1024], ['small', 512], ['large', 2048]]) {
                const effective = Math.min(Math.max(jpeg.value.width, jpeg.value.height), edge);
                if (seen.has(effective)) {
                    continue;
                }
                seen.add(effective);
                const preview = await measured(async () => {
                    const result = await new ImagePreviewDriver().processByStream(Readable.from([jpeg.value.bytes]), {size});
                    let bytes = 0;
                    const hash = createHash('sha256');
                    for await (const chunk of result.stream) {
                        bytes += chunk.length;
                        hash.update(chunk);
                    }
                    return {bytes, sha256: hash.digest('hex')};
                });
                previews.push({size, wallMs: preview.wallMs, cpuMs: preview.cpuMs, bytes: preview.value.bytes, sha256: preview.value.sha256});
            }
            trials.push({repeat, jpeg: {wallMs: jpeg.wallMs, cpuMs: jpeg.cpuMs, bytes: jpeg.value.bytes.length, sha256: createHash('sha256').update(jpeg.value.bytes).digest('hex')}, previews});
        }
        results.push({postId: source.postId, sourceContentId: source.sourceContentId, storageId: source.storageId,
            source: {format: metadata.format, width: metadata.width, height: metadata.height, bytes: read.value.length, sha256: createHash('sha256').update(read.value).digest('hex')},
            read: {wallMs: read.wallMs, cpuMs: read.cpuMs, path: kuboUrl ? 'kubo-cat' : 'public-gateway'}, trials});
    }
    return {schemaVersion: 1, kind: 'image-resave-read-probe', measuredAt: new Date().toISOString(),
        runtime: {arch: process.arch, platform: process.platform, node: process.version, sharp: sharp.versions.sharp,
            vips: sharp.versions.vips, cpus: os.cpus().length, loadAverage: os.loadavg(), maxRssKiB: process.resourceUsage().maxRSS},
        limitations: ['Only three selected source images; not a population throughput estimate.',
            'Second encode trial reuses in-memory source bytes. Watermark work is omitted.',
            'No IPFS writes/pinning, database, application queue or subsequent storage reads are measured.',
            'CPU time belongs to this isolated probe process; host contention can affect elapsed time.'], results};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const {values} = parseArgs({options: {manifest: {type: 'string'}, output: {type: 'string'}, gateway: {type: 'string'}, 'kubo-url': {type: 'string'}}});
    if (!values.manifest) {
        throw new Error('probe_manifest_required');
    }
    const report = await runImageResaveReadProbe(JSON.parse(await fs.readFile(values.manifest, 'utf8')),
        {gateway: values.gateway, kuboUrl: values['kubo-url']});
    if (values.output) {
        await fs.writeFile(values.output, JSON.stringify(report, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
    } else {
        console.log(JSON.stringify(report));
    }
}
