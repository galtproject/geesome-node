// Run with node --import tsx examples/prepared-image-upload.mjs --help.
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {prepareImageBundle, validateImageBundle, preparedImageSlots} from '../app/modules/content/preparedImage.ts';
import {maxImageBytes} from '../app/modules/drivers/convert/imageOptimize.ts';

export async function uploadImageBundle({apiUrl, apiKey, manifest, files}) {
    await validateImageBundle(manifest, files);
    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));
    for (const slot of preparedImageSlots) {
        form.append(slot, new Blob([files[slot]], {type: slot === 'file' ? 'image/jpeg' : 'image/webp'}), `${slot}.${slot === 'file' ? 'jpg' : 'webp'}`);
    }
    const response = await fetch(new URL('/v1/user/save-prepared-image', apiUrl), {method: 'POST',
        headers: {Authorization: `Bearer ${apiKey}`}, body: form, redirect: 'error', signal: AbortSignal.timeout(180000)});
    const value = await response.json();
    if (!response.ok) {
        throw Error(`prepared_upload_rejected:${response.status}:${value.code || 'unknown'}`);
    }
    if (value.status !== 'completed' || value.sourceContentId !== manifest.sourceContentId || !value.content?.id
        || value.content.extension !== 'jpg' || value.content.previewExtension !== 'webp') {
        throw Error('prepared_upload_receipt_invalid');
    }
    return value;
}

async function main() {
    const {values} = parseArgs({options: {input: {type: 'string'}, 'source-json': {type: 'string'},
        'driver-json': {type: 'string'}, 'bundle-dir': {type: 'string'}, upload: {type: 'boolean'}, help: {type: 'boolean'}}});
    if (values.help) {
        console.log('Prepare: npm run image:prepare-upload -- --input source.jpg --source-json owned-source.json --bundle-dir /private/bundle\nUpload/resume: GEESOME_API_URL=https://node.example GEESOME_API_KEY=... npm run image:prepare-upload -- --bundle-dir /private/bundle --upload\nOptional --driver-json uses the same imageOptimize/watermark driver as the frozen replacement. Preparation never changes the source or publishes. Upload creates owned Content and a source-policy receipt only.');
        return;
    }
    if (!values['bundle-dir'] || Boolean(values.input) !== Boolean(values['source-json'])) {
        throw Error('prepared_upload_arguments_invalid');
    }
    const dir = path.resolve(values['bundle-dir']);
    let bundle;
    if (values.input) {
        await mkdir(path.dirname(dir), {recursive: true, mode: 0o700});
        await mkdir(dir, {mode: 0o700}); // Never overwrite a durable existing bundle.
        if ((await stat(values.input)).size > maxImageBytes) {
            throw Error('prepared_input_too_large');
        }
        const source = JSON.parse(await readFile(values['source-json'], 'utf8'));
        const driver = values['driver-json'] ? JSON.parse(await readFile(values['driver-json'], 'utf8')) : undefined;
        const started = performance.now();
        bundle = await prepareImageBundle(await readFile(values.input), source, driver);
        for (const slot of preparedImageSlots) {
            await writeFile(path.join(dir, `${slot}.bin`), bundle.files[slot], {mode: 0o600});
        }
        await writeFile(path.join(dir, 'manifest.json'), JSON.stringify(bundle.manifest, null, 2), {mode: 0o600});
        console.log(JSON.stringify({stage: 'prepared', sourceContentId: bundle.manifest.sourceContentId,
            elapsedMs: performance.now() - started, bytes: Object.values(bundle.files).reduce((sum, bytes) => sum + bytes.length, 0)}));
    } else {
        const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
        const files = {};
        let total = 0;
        for (const slot of preparedImageSlots) {
            const file = path.join(dir, `${slot}.bin`);
            total += (await stat(file)).size;
            if (total > maxImageBytes) {
                throw Error('prepared_bundle_too_large');
            }
            files[slot] = await readFile(file);
        }
        bundle = {manifest, files};
    }
    await validateImageBundle(bundle.manifest, bundle.files);
    if (values.upload) {
        const apiUrl = process.env.GEESOME_API_URL;
        const apiKey = process.env.GEESOME_API_KEY;
        if (!apiKey || !apiUrl || new URL(apiUrl).username || new URL(apiUrl).password || (new URL(apiUrl).protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(new URL(apiUrl).hostname))) {
            throw Error('prepared_upload_environment_invalid');
        }
        const started = performance.now();
        // No automatic retries. An uncertain response can be reconciled by
        // submitting the same durable bundle; the source receipt controls reuse.
        const result = await uploadImageBundle({apiUrl, apiKey, ...bundle});
        await writeFile(path.join(dir, 'receipt.json'), JSON.stringify(result, null, 2), {mode: 0o600});
        console.log(JSON.stringify({stage: 'uploaded', sourceContentId: result.sourceContentId,
            resultContentId: result.content.id, reused: result.reused, elapsedMs: performance.now() - started}));
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
