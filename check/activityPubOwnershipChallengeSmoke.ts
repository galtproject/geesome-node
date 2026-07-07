import {exec as execCallback} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {createActivityPubSmokeHarness} from './helpers/activityPubSmokeHarness.js';

const execAsync = promisify(execCallback);
const defaultTimeoutMs = 15000;
const defaultCommandTimeoutMs = 30000;
const defaultUserId = 7;
const defaultSyntheticActorUrl = 'https://remote.example/users/activitypub-smoke';

async function run(): Promise<void> {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const options = getSmokeOptions();
  const actorContext = await getSmokeActorContext(options);
  if (!actorContext.actor) {
    printSmokeReport(getMissingActorReport(options, actorContext));
    return;
  }

  const capability = getSmokeActorCapabilityReport(options, actorContext.actor);
  if (!capability.canVerifySignedChallenge) {
    printSmokeReport(getActorCannotSignReport(options, actorContext, capability));
    return;
  }

  const harness = await createActivityPubSmokeHarness({
    remoteActorDocument: actorContext.actor,
    preserveRemoteActorDocumentKey: !options.localSigner,
    activityPubConfig: {
      publicUrl: options.publicUrl,
      domain: getPublicUrlDomain(options.publicUrl),
      deliveryWorker: false
    }
  });
  const challenge = await harness.module.createMigrationOwnershipChallenge(options.userId, {
    actorUrl: actorContext.actor.id,
    expiresInMs: options.expiresInMs,
    requestIp: options.requestIp
  });
  const proofContext = await getProofContext(options, harness, challenge, actorContext.actor);
  if (!proofContext.proof) {
    printSmokeReport(getProofSkippedReport(options, actorContext, capability, challenge));
    return;
  }

  const verified = await harness.module.verifyMigrationOwnershipChallenge(options.userId, {
    requestIp: options.requestIp,
    ownershipChallengeProof: proofContext.proof
  });
  printSmokeReport({
    ok: true,
    skipped: false,
    actor: getActorReport(actorContext.actor),
    discovery: actorContext.discovery,
    capability,
    challenge: getChallengeReport(challenge),
    proof: {
      source: proofContext.source,
      method: proofContext.proof.method || 'POST',
      hasHeaders: !!proofContext.proof.headers,
      hasBodyJson: !!proofContext.proof.bodyJson
    },
    verified: getVerifiedReport(verified)
  });
}

async function getSmokeActorContext(options) {
  if (options.localSigner) {
    return {
      actor: getSyntheticActor(options.actorUrl || defaultSyntheticActorUrl),
      discovery: {
        source: 'local-harness-signer'
      }
    };
  }
  if (options.actorUrl) {
    const actor = await fetchActivityPubJson(options.actorUrl, options);
    return {
      actor,
      discovery: {
        source: 'actor-url',
        actorUrl: options.actorUrl
      }
    };
  }
  if (options.resource) {
    return discoverActivityPubActor(options);
  }
  return {
    actor: null,
    discovery: {
      source: 'not-configured'
    }
  };
}

async function discoverActivityPubActor(options) {
  const webFingerUrl = getWebFingerUrl(options.resource);
  const webFinger = await fetchJson(webFingerUrl, options, {
    accept: 'application/jrd+json, application/json'
  });
  const actorUrl = getActivityPubSelfLink(webFinger);
  if (!actorUrl) {
    return {
      actor: null,
      discovery: {
        source: 'webfinger',
        resource: options.resource,
        webFingerUrl,
        actorUrl: null
      }
    };
  }
  return {
    actor: await fetchActivityPubJson(actorUrl, options),
    discovery: {
      source: 'webfinger',
      resource: options.resource,
      webFingerUrl,
      actorUrl
    }
  };
}

async function getProofContext(options, harness, challenge, actor) {
  if (options.localSigner) {
    return {
      source: 'local-harness-signer',
      proof: harness.signMigrationOwnershipChallenge(challenge)
    };
  }
  if (options.proofJson) {
    return {
      source: 'env-json',
      proof: normalizeProofInput(parseJson(options.proofJson), challenge)
    };
  }
  if (options.proofFile) {
    const proofJson = await readFile(options.proofFile, 'utf8');
    return {
      source: 'file',
      proof: normalizeProofInput(parseJson(proofJson), challenge)
    };
  }
  if (options.signCommand) {
    return {
      source: 'sign-command',
      proof: await runSignCommand(options, challenge, actor)
    };
  }
  return {
    source: 'none',
    proof: null
  };
}

async function runSignCommand(options, challenge, actor) {
  const tempDir = await mkdtemp(join(tmpdir(), 'geesome-activitypub-challenge-'));
  const contextPath = join(tempDir, 'challenge-context.json');
  const bodyPath = join(tempDir, 'challenge-body.json');
  try {
    await writeFile(contextPath, JSON.stringify(getSignCommandContext(challenge, actor), null, 2));
    await writeFile(bodyPath, challenge.bodyJson);
    const {stdout} = await execAsync(options.signCommand, {
      timeout: options.commandTimeoutMs,
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        ACTIVITYPUB_OWNERSHIP_CHALLENGE_CONTEXT_FILE: contextPath,
        ACTIVITYPUB_OWNERSHIP_CHALLENGE_BODY_FILE: bodyPath,
        ACTIVITYPUB_OWNERSHIP_CHALLENGE_TOKEN: challenge.challengeToken,
        ACTIVITYPUB_OWNERSHIP_CHALLENGE_VERIFY_URL: challenge.verificationUrl
      }
    });
    return normalizeProofInput(parseJson(stdout), challenge);
  } finally {
    await rm(tempDir, {recursive: true, force: true});
  }
}

function getSignCommandContext(challenge, actor) {
  return {
    actor: getActorReport(actor),
    challenge: getChallengeReport(challenge),
    signing: {
      method: 'POST',
      url: challenge.verificationUrl,
      bodyJson: challenge.bodyJson,
      requiredSignedHeaders: ['(request-target)', 'host', 'date'],
      proofOutputShape: {
        challengeToken: challenge.challengeToken,
        method: 'POST',
        url: challenge.verificationUrl,
        headers: {'Signature': '...'},
        bodyJson: challenge.bodyJson
      }
    }
  };
}

function normalizeProofInput(proof, challenge) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
    throw new Error('activitypub_ownership_challenge_smoke_proof_invalid');
  }
  return {
    ...proof,
    challengeToken: proof.challengeToken || challenge.challengeToken,
    method: proof.method || 'POST',
    url: proof.url || challenge.verificationUrl,
    bodyJson: proof.bodyJson || proof.body || challenge.bodyJson
  };
}

async function fetchActivityPubJson(url: string, options) {
  return fetchJson(url, options, {
    accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams", application/ld+json, application/json'
  });
}

async function fetchJson(url: string, options, fetchOptions: any = {}) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: fetchOptions.accept || 'application/json'
      },
      signal: abortController.signal
    });
    if (!response.ok) {
      throw new Error(`activitypub_ownership_challenge_smoke_fetch_failed:${response.status}:${url}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function getSmokeOptions() {
  return {
    actorUrl: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_ACTOR_URL),
    resource: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_RESOURCE),
    publicUrl: getSmokePublicUrl(),
    timeoutMs: parsePositiveInteger(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_TIMEOUT_MS, defaultTimeoutMs),
    commandTimeoutMs: parsePositiveInteger(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND_TIMEOUT_MS, defaultCommandTimeoutMs),
    expiresInMs: parsePositiveInteger(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_EXPIRES_IN_MS, 15 * 60 * 1000),
    userId: parsePositiveInteger(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_USER_ID, defaultUserId),
    requestIp: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_REQUEST_IP),
    signCommand: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND),
    proofFile: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_FILE),
    proofJson: getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_JSON),
    localSigner: parseBoolean(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER, false)
  };
}

function getSmokePublicUrl(): string {
  const explicitPublicUrl = getOptionalString(process.env.ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PUBLIC_URL) ||
    getOptionalString(process.env.ACTIVITYPUB_PUBLIC_URL);
  if (explicitPublicUrl) {
    return normalizePublicUrl(explicitPublicUrl);
  }
  return normalizePublicUrl(getPublicUrlFromDomain(process.env.DOMAIN) || 'https://social.example');
}

function getActorCapabilityReport(actor) {
  const keys = getActorPublicKeys(actor);
  return {
    actorUrl: getOptionalString(actor?.id),
    publicKeyCount: keys.length,
    publicKeyIds: keys.map(key => getOptionalString(key.id)).filter(Boolean),
    canVerifySignedChallenge: !!getOptionalString(actor?.id) && keys.some(isUsableActorPublicKey)
  };
}

function getSmokeActorCapabilityReport(options, actor) {
  if (!options.localSigner) {
    return getActorCapabilityReport(actor);
  }
  return {
    actorUrl: getOptionalString(actor?.id),
    publicKeyCount: 1,
    publicKeyIds: ['local-harness-generated-key'],
    canVerifySignedChallenge: !!getOptionalString(actor?.id)
  };
}

function getActorPublicKeys(actor): any[] {
  if (Array.isArray(actor?.publicKey)) {
    return actor.publicKey;
  }
  if (actor?.publicKey && typeof actor.publicKey === 'object') {
    return [actor.publicKey];
  }
  return [];
}

function isUsableActorPublicKey(key): boolean {
  if (!getOptionalString(key?.id)) {
    return false;
  }
  if (!getOptionalString(key?.owner)) {
    return false;
  }
  if (!getOptionalString(key?.publicKeyPem)) {
    return false;
  }
  return true;
}

function getActorReport(actor) {
  return {
    id: getOptionalString(actor?.id),
    type: getOptionalString(actor?.type),
    preferredUsername: getOptionalString(actor?.preferredUsername),
    inbox: getOptionalString(actor?.inbox),
    publicKeys: getActorPublicKeys(actor).map(key => ({
      id: getOptionalString(key?.id),
      owner: getOptionalString(key?.owner),
      hasPublicKeyPem: !!getOptionalString(key?.publicKeyPem)
    }))
  };
}

function getChallengeReport(challenge) {
  return {
    actor: challenge.actor,
    challengeToken: challenge.challengeToken,
    challengeUrl: challenge.challengeUrl,
    verificationUrl: challenge.verificationUrl,
    expiresAt: challenge.expiresAt,
    body: challenge.body,
    bodyJson: challenge.bodyJson
  };
}

function getVerifiedReport(verified) {
  return {
    verified: verified.verified,
    method: verified.method,
    actor: verified.actor,
    challengeToken: verified.challengeToken,
    verifiedAt: verified.verifiedAt,
    expiresAt: verified.expiresAt,
    keyId: verified.keyId
  };
}

function getMissingActorReport(options, actorContext) {
  return {
    ok: true,
    skipped: true,
    reason: 'activitypub_ownership_challenge_actor_not_configured',
    discovery: actorContext.discovery,
    requiredEnv: [
      'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_ACTOR_URL',
      'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_RESOURCE'
    ],
    localHarnessEnv: 'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER=1',
    publicUrl: options.publicUrl
  };
}

function getActorCannotSignReport(options, actorContext, capability) {
  return {
    ok: true,
    skipped: true,
    reason: 'activitypub_ownership_challenge_actor_public_key_missing',
    actor: getActorReport(actorContext.actor),
    discovery: actorContext.discovery,
    capability,
    publicUrl: options.publicUrl
  };
}

function getProofSkippedReport(options, actorContext, capability, challenge) {
  return {
    ok: true,
    skipped: true,
    reason: 'activitypub_ownership_challenge_proof_not_supplied',
    actor: getActorReport(actorContext.actor),
    discovery: actorContext.discovery,
    capability,
    challenge: getChallengeReport(challenge),
    signing: getSignCommandContext(challenge, actorContext.actor).signing,
    proofInputs: {
      command: 'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND',
      proofFile: 'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_FILE',
      proofJson: 'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_JSON',
      localHarness: 'ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER=1'
    },
    publicUrl: options.publicUrl
  };
}

function getSyntheticActor(actorUrl: string) {
  return {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: actorUrl,
    type: 'Person',
    preferredUsername: 'activitypub-smoke',
    inbox: `${actorUrl}/inbox`,
    endpoints: {
      sharedInbox: 'https://remote.example/inbox'
    }
  };
}

function getWebFingerUrl(resource: string): string {
  const domain = getResourceDomain(resource);
  return `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
}

function getResourceDomain(resource: string): string {
  const atIndex = resource.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === resource.length - 1) {
    throw new Error('activitypub_ownership_challenge_smoke_resource_domain_required');
  }
  return resource.slice(atIndex + 1);
}

function getActivityPubSelfLink(webFinger) {
  const links = Array.isArray(webFinger?.links) ? webFinger.links : [];
  const link = links.find(item => item?.rel === 'self' && typeof item?.href === 'string');
  return link?.href || null;
}

function getOptionalString(value: any): string {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text;
}

function parseBoolean(value: any, fallback: boolean): boolean {
  const normalizedValue = String(value || '').trim().toLowerCase();
  if (!normalizedValue) {
    return fallback;
  }
  if (['1', 'true', 'yes', 'on'].includes(normalizedValue)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalizedValue)) {
    return false;
  }
  return fallback;
}

function parsePositiveInteger(value: any, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

function parseJson(value: string) {
  const trimmedValue = String(value || '').trim();
  if (!trimmedValue) {
    throw new Error('activitypub_ownership_challenge_smoke_json_empty');
  }
  return JSON.parse(trimmedValue);
}

function getPublicUrlFromDomain(domain: any): string {
  const rawDomain = String(domain || '').trim().replace(/^@/, '');
  if (!rawDomain) {
    return '';
  }
  if (rawDomain.includes('://')) {
    return rawDomain;
  }
  const cleanDomain = rawDomain.replace(/^\/+/, '').split('/')[0];
  if (!cleanDomain) {
    return '';
  }
  return `https://${cleanDomain}`;
}

function normalizePublicUrl(value: any): string {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    throw new Error('activitypub_ownership_challenge_smoke_public_url_required');
  }
  const parsedUrl = new URL(rawValue);
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('activitypub_ownership_challenge_smoke_public_url_invalid');
  }
  parsedUrl.search = '';
  parsedUrl.hash = '';
  const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname.replace(/\/+$/, '');
  return `${parsedUrl.origin}${path}`;
}

function getPublicUrlDomain(publicUrl: string): string {
  return new URL(publicUrl).host;
}

function printSmokeReport(report): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function printUsage(): void {
  console.log(`Usage:
  npm run activitypub:ownership-challenge-smoke
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_ACTOR_URL=https://remote.example/users/alice npm run activitypub:ownership-challenge-smoke
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER=1 npm run activitypub:ownership-challenge-smoke

Creates a GeeSome ActivityPub migration ownership challenge and verifies a signed
proof when a compatible signer is available. Without an actor it prints a skip.
With an actor but no proof/signing command it prints the exact challenge body,
verification URL, required signed headers, and proof shape.

Environment:
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_ACTOR_URL       Direct ActivityPub actor URL
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_RESOURCE        WebFinger resource, e.g. acct:alice@example.social
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PUBLIC_URL      Public GeeSome URL, falls back to ACTIVITYPUB_PUBLIC_URL, DOMAIN, then https://social.example
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND    Command that reads the challenge env/files and prints proof JSON
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_FILE      Proof JSON file for the current challenge
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_PROOF_JSON      Proof JSON for the current challenge
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_LOCAL_SIGNER    Set to 1 for deterministic local harness signing
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_TIMEOUT_MS      Network timeout, default 15000
  ACTIVITYPUB_OWNERSHIP_CHALLENGE_SMOKE_SIGN_COMMAND_TIMEOUT_MS
                                                              Sign command timeout, default 30000`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
