import assert from 'node:assert';
import {renderReport} from '../check/databaseStorageSpaceReport.js';

describe('databaseStorageSpaceReport', () => {
  it('renders availability evidence collected for restored-database rehearsals', () => {
    const report = renderReport({
      generatedAt: new Date('2026-06-23T10:00:00Z'),
      database: {
        host: 'postgres',
        port: 5432,
        name: 'geesome_test',
      },
      limit: 20,
      hasRemotePinRefs: true,
      hasAvailabilitySamples: true,
      overview: getEmptyOverview(),
      typeBreakdown: [],
      topContents: [],
      topFileCatalogItems: [],
      fileCatalogFolders: [],
      topGroups: [],
      groupPosts: [],
      generatedOutputs: [],
      sharedStorageIds: [],
      pinnedStorageObjects: [],
      previewStorage: [],
      availabilitySignals: [
        {
          storageId: 'bafy-signal',
          physicalBytes: 2048,
          contentRowsCount: 2,
          usersCount: 1,
          activeFileCatalogRefsCount: 3,
          groupPostRefsCount: 4,
          generatedOutputRefsCount: 5,
          localPinRefsCount: 1,
          remotePinsCount: 2,
          maxPeerCount: 7,
          maxFullyPeerCount: 6,
          latestSignalAt: new Date('2026-06-23T09:00:00Z'),
        },
      ],
      availabilityNetworkSampleSummary: [
        {
          storageId: 'bafy-signal',
          samplesCount: 3,
          providerLookupOkCount: 2,
          retrievalStatOkCount: 1,
          maxProvidersCount: 8,
          latestProvidersCount: 5,
          latestRetrievalStatOk: true,
          latestRetrievalMeasuredBytes: 4096,
          firstSampledAt: new Date('2026-06-22T08:00:00Z'),
          latestSampledAt: new Date('2026-06-23T08:00:00Z'),
        },
      ],
    });

    assert.match(report, /## Availability Signals/);
    assert.match(report, /Availability samples table: present/);
    assert.match(report, /\| bafy-signal \|2048 \(2\.0 KB\) \|2 \|1 \|3 \|4 \|5 \|1 \|2 \|7 \|6 \|2026-06-23T09:00:00\.000Z \|/);
    assert.match(report, /## Availability Network Sample Summary/);
    assert.match(report, /\| bafy-signal \|3 \|2 \|1 \|8 \|5 \|true \|4096 \(4\.0 KB\) \|2026-06-22T08:00:00\.000Z \|2026-06-23T08:00:00\.000Z \|/);
  });
});

function getEmptyOverview() {
  return {
    contentRowsCount: 0,
    contentStorageObjectsCount: 0,
    logicalContentBytes: 0,
    physicalContentBytes: 0,
    duplicateStorageIdsCount: 0,
    duplicateContentRowsCount: 0,
    fileCatalogItemsCount: 0,
    fileCatalogLogicalBytes: 0,
    groupPostsCount: 0,
    groupPostsLogicalBytes: 0,
    pinnedStorageObjectsCount: 0,
    pinnedPhysicalBytes: 0,
    remotePinnedStorageObjectsCount: 0,
    remotePinRefsCount: 0,
    generatedOutputStorageRefsCount: 0,
    generatedOutputUniqueStorageIdsCount: 0,
    generatedOutputKnownStorageObjectsCount: 0,
    generatedOutputKnownPhysicalBytes: 0,
    generatedOutputUnknownStorageIdsCount: 0,
  };
}
