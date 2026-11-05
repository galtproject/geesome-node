import assert from 'node:assert/strict';
import {randomBytes, randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {create} from 'kubo-rpc-client';
import {CID} from 'multiformats/cid';
import {sha256} from 'multiformats/hashes/sha2';
import * as dagCbor from '@ipld/dag-cbor';
import JsIpfsServiceNode from 'geesome-libs/src/JsIpfsServiceNode.js';
import {configureStoragePinning} from '../app/modules/storage/index.js';
import {createKuboGc} from '../app/modules/storage/kuboGc.js';

// Native GC deliberately bypasses the application's PostgreSQL barrier. These
// imports must protect themselves in Kubo; no application fence is used here.
describe('GC-safe pinned Kubo imports', function () {
    this.timeout(120000);
    let node, service, directory;
    before(async () => {
        node = create({url: process.env.STORAGE_URL || 'http://127.0.0.1:5001'});
        node.repo.gc = createKuboGc(node.getEndpointConfig());
        service = configureStoragePinning(new JsIpfsServiceNode(node, 'kubo-rpc') as any);
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pinned-import-'));
    });
    after(async () => {
        await fs.rm(directory, {recursive: true, force: true});
        // This client does not own the Kubo daemon.
    });
    async function recursivelyPinned(value) {
        const cid = CID.parse(value).toV1();
        const pins = [];
        for await (const pin of node.pin.ls({paths: [cid], type: 'recursive'})) {
            pins.push(pin);
        }
        assert(pins.some(pin => pin.type === 'recursive' && pin.cid.toV1().equals(cid)));
    }
    async function bytes(value) {
        const chunks = [];
        for await (const chunk of node.cat(value)) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    async function collect() {
        for await (const result of node.repo.gc()) {
            assert.equal(result.err, null);
        }
    }

    it('preserves CIDv1 file and DAG-CBOR identities and returns pinned roots before native GC', async () => {
        const content = randomBytes(65536);
        const expected = await node.add(content, {onlyHash: true, pin: false, cidVersion: 1});
        const file = await service.saveFileByData(content, {waitForPin: false});
        assert(CID.parse(file.id).toV1().equals(expected.cid.toV1()));
        await recursivelyPinned(file.id);
        const filePath = path.join(directory, 'original.bin');
        await fs.writeFile(filePath, content);
        const fromPath = await service.saveFileByPath(filePath, {waitForPin: false});
        assert.equal(fromPath.id, file.id);
        const object = {key: randomUUID(), value: 3};
        const expectedObject = CID.createV1(dagCbor.code, await sha256.digest(dagCbor.encode(object)));
        const objectId = await service.saveObject(object, {waitForPin: false});
        assert(CID.parse(objectId).toV1().equals(expectedObject));
        await recursivelyPinned(objectId);
        const dir = await service.saveDirectory(directory, {waitForPin: false});
        await recursivelyPinned(dir.id);
        await collect();
        assert.deepEqual(await bytes(file.id), content);
        assert.deepEqual(await bytes(`${dir.id}/original.bin`), content);
        assert.deepEqual((await node.dag.get(CID.parse(objectId))).value, object);
    });

    it('keeps a streamed pinned import readable when native GC runs concurrently', async () => {
        const content = randomBytes(1024 * 1024);
        let announce;
        const started = new Promise<void>(resolve => { announce = resolve; });
        async function * stream() {
            for (let offset = 0; offset < content.length; offset += 65536) {
                yield content.subarray(offset, offset + 65536);
                announce();
                await new Promise(resolve => setTimeout(resolve, 2));
            }
        }
        const writing = service.saveFile({path: 'concurrent.bin', content: stream()}, {waitForPin: false});
        await started;
        const collecting = collect();
        const [file] = await Promise.all([writing, collecting]);
        await recursivelyPinned(file.id);
        assert.deepEqual(await bytes(file.id), content);
    });

    it('refuses an emitted object CID when its recursive pin was not retained', async () => {
        const original = node.dag.put;
        node.dag.put = async (...args) => {
            const cid = await original(...args);
            // Model an unusable late import outcome. Only this test's fresh CID
            // is unpinned; confirmation must not treat the emitted CID as proof.
            await node.pin.rm(cid);
            return cid;
        };
        try {
            await assert.rejects(service.saveObject({key: randomUUID()}, {timeout: 1000}));
        } finally {
            node.dag.put = original;
        }
    });
});
