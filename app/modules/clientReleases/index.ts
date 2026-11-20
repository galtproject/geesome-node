import {createHash} from 'node:crypto';
import {withStorageFence, storageFenceSignal} from '../../storageLifecycle.js';
import {CorePermissionName} from '../database/interface.js';
import {Op} from 'sequelize';
import {variants} from '../../storageIdentity.js';
import {releasePublicKey, verifyReleaseEnvelope, compareReleaseVersions, releaseProblem} from './manifest.js';
import createModel from './models.js';
import registerApi from './api.js';

export default async function clientReleases(app) {
	const pem = app.config.clientReleasesConfig?.publicKey;
	if (!pem) {
		return {enabled: false};
	}
	app.checkModules(['api', 'database', 'storage', 'content']);
	const key = releasePublicKey(pem);
	const Release = await createModel(app.ms.database.sequelize);
	app.ms.database.registerStorageIdReferenceSource(releaseReferenceSource(Release));
	const module = getModule(app, Release, key);
	registerApi(app, module);
	return module;
}

export function releaseReferenceSource(Release) {
	return {name: 'client-releases', count: async storageId => {
		let aliases;
		try {
			aliases = variants(storageId);
		} catch {
			return 0;
		}
		return Release.count({where: {cid: {[Op.in]: aliases}}});
	}};
}

export function getModule(app, Release, key, options: any = {}) {
	const fence = options.fence || (run => withStorageFence(app, 'shared', run));
	const module = {
		enabled: true,
		async stable() {
			const row = await Release.findOne({where: {stable: true}});
			if (!row) {
				throw releaseProblem(404, 'client_release_not_published');
			}
			// A configured-key change must not advertise descriptors no longer trusted.
			verifyReleaseEnvelope(row.envelope, key);
			return row.envelope;
		},
		async publish(userId, envelope) {
			await app.checkUserCan(userId, CorePermissionName.AdminAll);
			const manifest = verifyReleaseEnvelope(envelope, key);
			return fence(async (assertHeld = async () => undefined) => {
				// Content cleanup takes the exclusive storage fence. Keep verification, pinning
				// and committed reference registration inside the shared fence, in that order.
				await verifyArtifact(app.ms.storage, manifest, {signal: storageFenceSignal()});
				await assertHeld();
				await app.ms.storage.addPin(manifest.cid);
				await assertHeld();
				return Release.sequelize.transaction(async transaction => {
					// One fixed transaction-scoped lock serializes the singleton stable pointer
					// across processes, including the first publication when no row exists.
					await Release.sequelize.query('SELECT pg_advisory_xact_lock(18203, 7347)', {transaction});
					const current = await Release.findOne({where: {stable: true}, transaction});
					const known = await Release.findByPk(manifest.version, {transaction});
					if (known && (known.envelope.manifest !== envelope.manifest || known.envelope.signature !== envelope.signature)) {
						throw releaseProblem(409, 'client_release_version_conflict');
					}
					if (current && compareReleaseVersions(manifest.version, current.version) < 0) {
						throw releaseProblem(409, 'client_release_downgrade');
					}
					if (current?.version === manifest.version) {
						return current.envelope;
					}
					await Release.update({stable: false}, {where: {stable: true}, transaction});
					if (known) {
						await known.update({stable: true}, {transaction});
					} else {
						await Release.create({version: manifest.version, cid: manifest.cid, envelope, stable: true}, {transaction});
					}
					await assertHeld();
					return envelope;
				});
			});
		}
	};
	return module;
}

export async function verifyArtifact(storage, manifest, {timeoutMs = 120000, signal = undefined as AbortSignal | undefined} = {}) {
	const controller = new AbortController();
	let stream;
	let timeout;
	let abort;
	try {
		const expired = new Promise<never>((_resolve, reject) => {
			abort = () => {
				controller.abort();
				stream?.destroy?.();
				reject(releaseProblem(400, 'client_release_artifact_unavailable'));
			};
			timeout = setTimeout(abort, timeoutMs);
			signal?.addEventListener('abort', abort, {once: true});
			if (signal?.aborted) {
				abort();
			}
		});
		const read = (async () => {
			stream = await storage.getFileStream(manifest.cid, {signal: controller.signal});
			if (controller.signal.aborted) {
				stream?.destroy?.();
				throw releaseProblem(400, 'client_release_artifact_unavailable');
			}
			const hash = createHash('sha256');
			let size = 0;
			for await (const chunk of stream) {
				size += chunk.length;
				if (size > manifest.size || controller.signal.aborted) {
					throw releaseProblem(400, 'client_release_artifact_invalid');
				}
				hash.update(chunk);
			}
			if (size !== manifest.size || hash.digest('hex') !== manifest.sha256) {
				throw releaseProblem(400, 'client_release_artifact_invalid');
			}
		})();
		await Promise.race([read, expired]);
	} catch (error) {
		if (error.code === 'client_release_artifact_invalid') {
			throw error;
		}
		throw releaseProblem(400, 'client_release_artifact_unavailable');
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener('abort', abort);
		stream?.destroy?.();
	}
}
