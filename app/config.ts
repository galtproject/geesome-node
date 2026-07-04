/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

//TODO: move communicator and fileCatalog to improve
const modulePacks = {
  'main': ['drivers', 'database', 'api', 'accountStorage', 'communicator', 'storage', 'content', 'staticId', 'asyncOperation', 'group', 'entityJsonManifest', 'remoteGroup'],
  'improve': ['groupCategory', 'invite', 'staticSiteGenerator', 'rss', 'activityPub', 'autoActions', 'pin', 'foreignAccounts', 'ethereumAuthorization', 'fileCatalog', 'storageSpace', 'gateway'],
  'socNet': ['socNetAccount', 'socNetImport', 'bluesky', 'telegramClient', 'twitterClient', 'tgContentBot']
};

//TODO: refactor modules config
export default {
  databaseModule: 'sql',
  databaseConfig: {

  },
  storageConfig: {
    implementation: process.env.STORAGE_MODULE || 'js-ipfs',
    jsNode: {
      // getting by getSecretKey
      pass: '',
      // repo: '~/.jsipfs',
    },
    goNode: {url: process.env.STORAGE_URL || 'http://127.0.0.1:5001'}
  },
  activityPubConfig: {
    enabled: process.env.ACTIVITYPUB_ENABLED === '1',
    publicUrl: process.env.ACTIVITYPUB_PUBLIC_URL || '',
    domain: process.env.ACTIVITYPUB_DOMAIN || '',
    deliveryWorker: process.env.ACTIVITYPUB_DELIVERY_WORKER === '1',
    deliveryWorkerIntervalMs: process.env.ACTIVITYPUB_DELIVERY_WORKER_INTERVAL_MS,
    deliveryWorkerLimit: process.env.ACTIVITYPUB_DELIVERY_WORKER_LIMIT,
    deliveryClaimTtlMs: process.env.ACTIVITYPUB_DELIVERY_CLAIM_TTL_MS,
    sourceRefreshWorker: process.env.ACTIVITYPUB_SOURCE_REFRESH_WORKER === '1',
    sourceRefreshWorkerIntervalMs: process.env.ACTIVITYPUB_SOURCE_REFRESH_WORKER_INTERVAL_MS,
    sourceRefreshWorkerLimit: process.env.ACTIVITYPUB_SOURCE_REFRESH_WORKER_LIMIT,
    sourceRefreshPoller: process.env.ACTIVITYPUB_SOURCE_REFRESH_POLLER === '1',
    sourceRefreshPollerIntervalMs: process.env.ACTIVITYPUB_SOURCE_REFRESH_POLLER_INTERVAL_MS,
    sourceRefreshPollerLimit: process.env.ACTIVITYPUB_SOURCE_REFRESH_POLLER_LIMIT,
    sourceRefreshPollerStaleMs: process.env.ACTIVITYPUB_SOURCE_REFRESH_POLLER_STALE_MS
  },
  blueskyConfig: {
    publicApiOrigin: process.env.BLUESKY_PUBLIC_API_ORIGIN || 'https://public.api.bsky.app',
    publicApiTimeoutMs: process.env.BLUESKY_PUBLIC_API_TIMEOUT_MS,
    sourceRefreshWorker: process.env.BLUESKY_SOURCE_REFRESH_WORKER === '1',
    sourceRefreshWorkerIntervalMs: process.env.BLUESKY_SOURCE_REFRESH_WORKER_INTERVAL_MS,
    sourceRefreshWorkerLimit: process.env.BLUESKY_SOURCE_REFRESH_WORKER_LIMIT,
    sourceRefreshPoller: process.env.BLUESKY_SOURCE_REFRESH_POLLER === '1',
    sourceRefreshPollerIntervalMs: process.env.BLUESKY_SOURCE_REFRESH_POLLER_INTERVAL_MS,
    sourceRefreshPollerLimit: process.env.BLUESKY_SOURCE_REFRESH_POLLER_LIMIT,
    sourceRefreshPollerStaleMs: process.env.BLUESKY_SOURCE_REFRESH_POLLER_STALE_MS
  },
  modules: process.env.MODULES ? process.env.MODULES.split(',') : modulePacks.main.concat(modulePacks.improve).concat(modulePacks.socNet)
};
