/**
 * Storage-space report for migrated/restored databases.
 *
 * Run with:
 *   npm run database:storage-space-report
 *   STORAGE_SPACE_REPORT_LIMIT=50 npm run database:storage-space-report
 *   STORAGE_SPACE_REPORT_PATH=- npm run database:storage-space-report
 */

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {QueryTypes, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';
import {
  getStorageSpaceAvailabilityNetworkSampleSummary,
  getStorageSpaceAvailabilitySignals,
  getStorageSpaceFileCatalogFolders,
  getStorageSpaceGeneratedOutputs,
  getStorageSpaceGroupPosts,
  getStorageSpaceOverview,
  getStorageSpacePinnedStorageObjects,
  getStorageSpacePreviewStorage,
  getStorageSpaceSharedStorageIds,
  getStorageSpaceTopContents,
  getStorageSpaceTopFileCatalogItems,
  getStorageSpaceTopGroups,
  getStorageSpaceTypeBreakdown,
} from '../app/modules/storageSpace/queryHelpers.js';

const defaultReportPath = 'docs/storage-space-report.md';
const defaultReportLimit = 20;

type ReportData = {
  generatedAt: Date;
  database: {
    host?: string;
    port?: number;
    name?: string;
  };
  limit: number;
  hasRemotePinRefs: boolean;
  hasAvailabilitySamples: boolean;
  overview: any;
  typeBreakdown: any[];
  topContents: any[];
  topFileCatalogItems: any[];
  fileCatalogFolders: any[];
  topGroups: any[];
  groupPosts: any[];
  generatedOutputs: any[];
  sharedStorageIds: any[];
  pinnedStorageObjects: any[];
  previewStorage: any[];
  availabilitySignals: any[];
  availabilityNetworkSampleSummary: any[];
};

async function run(): Promise<void> {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    printUsage();
    return;
  }

  const limit = parsePositiveInteger(process.env.STORAGE_SPACE_REPORT_LIMIT, defaultReportLimit);
  const reportPath = process.env.STORAGE_SPACE_REPORT_PATH || defaultReportPath;
  const sequelize = new Sequelize({
    ...(databaseConfig as any),
    logging: false,
  });

  try {
    await sequelize.authenticate();
    const hasRemotePinRefs = await tableExists(sequelize, 'pinStorageObjects');
    const hasAvailabilitySamples = await tableExists(sequelize, 'storageSpaceAvailabilitySamples');
    const listParams = {
      limit,
      offset: 0,
      parentItemId: null,
      groupId: null,
      storageId: null,
      hasRemotePinRefs,
    };
    const data: ReportData = {
      generatedAt: new Date(),
      database: getDatabaseTarget(),
      limit,
      hasRemotePinRefs,
      hasAvailabilitySamples,
      overview: await getStorageSpaceOverview(sequelize, {hasRemotePinRefs}),
      typeBreakdown: await getStorageSpaceTypeBreakdown(sequelize, listParams),
      topContents: await getStorageSpaceTopContents(sequelize, listParams),
      topFileCatalogItems: await getStorageSpaceTopFileCatalogItems(sequelize, listParams),
      fileCatalogFolders: await getStorageSpaceFileCatalogFolders(sequelize, listParams),
      topGroups: await getStorageSpaceTopGroups(sequelize, listParams),
      groupPosts: await getStorageSpaceGroupPosts(sequelize, listParams),
      generatedOutputs: await getStorageSpaceGeneratedOutputs(sequelize, listParams),
      sharedStorageIds: await getStorageSpaceSharedStorageIds(sequelize, listParams),
      pinnedStorageObjects: await getStorageSpacePinnedStorageObjects(sequelize, listParams),
      previewStorage: await getStorageSpacePreviewStorage(sequelize, listParams),
      availabilitySignals: await getStorageSpaceAvailabilitySignals(sequelize, listParams),
      availabilityNetworkSampleSummary: hasAvailabilitySamples
        ? await getStorageSpaceAvailabilityNetworkSampleSummary(sequelize, listParams)
        : [],
    };
    const report = renderReport(data);

    if (reportPath === '-') {
      console.log(report);
    } else {
      fs.mkdirSync(path.dirname(reportPath), {recursive: true});
      fs.writeFileSync(reportPath, report);
      console.log(`Storage-space report written to ${reportPath}`);
    }
  } finally {
    await sequelize.close();
  }
}

function printUsage() {
  console.log(`Usage:
  npm run database:storage-space-report
  STORAGE_SPACE_REPORT_LIMIT=50 npm run database:storage-space-report
  STORAGE_SPACE_REPORT_PATH=- npm run database:storage-space-report

Writes a read-only storage-space report for the configured Postgres database.
Use after database:migration-rehearsal on restored backups to capture operator
storage totals and top drilldown rows before delayed-GC design or cleanup.`);
}

async function tableExists(sequelize: Sequelize, tableName: string): Promise<boolean> {
  const rows = await sequelize.query<{exists: boolean}>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = :tableName
    ) AS "exists"`,
    {replacements: {tableName}, type: QueryTypes.SELECT},
  );

  return rows[0]?.exists === true;
}

function getDatabaseTarget() {
  const config = databaseConfig as any;
  return {
    host: config.host,
    port: config.port,
    name: config.database,
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function renderReport(data: ReportData): string {
  return [
    '# Storage Space Report',
    '',
    `Generated at: ${data.generatedAt.toISOString()}`,
    `Database: ${data.database.host || 'localhost'}:${data.database.port || 5432}/${data.database.name || ''}`,
    `List limit: ${data.limit}`,
    `Remote pin refs table: ${data.hasRemotePinRefs ? 'present' : 'absent'}`,
    `Availability samples table: ${data.hasAvailabilitySamples ? 'present' : 'absent'}`,
    '',
    '## Overview',
    '',
    renderOverviewTable(data.overview),
    '',
    '## Type Breakdown',
    '',
    renderTable(
      ['MIME type', 'Extension', 'Content rows', 'Storage objects', 'Logical bytes', 'Physical bytes'],
      data.typeBreakdown,
      row => [row.mimeType, row.extension, row.contentRowsCount, row.storageObjectsCount, formatBytesCell(row.logicalBytes), formatBytesCell(row.physicalBytes)],
    ),
    '',
    '## Top Content Rows',
    '',
    renderTable(
      ['ID', 'User', 'Name', 'MIME type', 'Storage ID', 'Size'],
      data.topContents,
      row => [row.id, row.userId, row.name, row.mimeType, row.storageId, formatBytesCell(row.size)],
    ),
    '',
    '## Top File-Catalog Files',
    '',
    renderTable(
      ['ID', 'User', 'Path name', 'Content ID', 'Storage ID', 'Size'],
      data.topFileCatalogItems,
      row => [row.id, row.userId, row.name, row.contentId, row.storageId, formatBytesCell(row.size)],
    ),
    '',
    '## File-Catalog Folders',
    '',
    renderTable(
      ['ID', 'User', 'Name', 'Files', 'Direct files', 'Storage objects', 'Logical bytes', 'Physical bytes'],
      data.fileCatalogFolders,
      row => [row.id, row.userId, row.name, row.filesCount, row.directFilesCount, row.storageObjectsCount, formatBytesCell(row.logicalBytes), formatBytesCell(row.physicalBytes)],
    ),
    '',
    '## Top Groups',
    '',
    renderTable(
      ['ID', 'Name', 'Title', 'Available posts', 'Size'],
      data.topGroups,
      row => [row.id, row.name, row.title, row.availablePostsCount, formatBytesCell(row.size)],
    ),
    '',
    '## Group Posts',
    '',
    renderTable(
      ['ID', 'Group', 'Local ID', 'Name', 'Attachments', 'Storage objects', 'Logical bytes', 'Physical bytes'],
      data.groupPosts,
      row => [row.id, row.groupId, row.localId, row.name, row.attachmentsCount, row.storageObjectsCount, formatBytesCell(row.logicalBytes), formatBytesCell(row.physicalBytes)],
    ),
    '',
    '## Generated Outputs',
    '',
    renderTable(
      ['Source', 'Refs', 'Unique storage IDs', 'Known objects', 'Known physical bytes', 'Unknown IDs'],
      data.generatedOutputs,
      row => [row.source, row.storageRefsCount, row.uniqueStorageIdsCount, row.knownStorageObjectsCount, formatBytesCell(row.knownPhysicalBytes), row.unknownStorageIdsCount],
    ),
    '',
    '## Shared Storage IDs',
    '',
    renderTable(
      ['Storage ID', 'Rows', 'Users', 'Logical bytes', 'Physical bytes', 'Savings', 'Catalog refs', 'Post refs', 'Pinned'],
      data.sharedStorageIds,
      row => [row.storageId, row.contentRowsCount, row.usersCount, formatBytesCell(row.logicalBytes), formatBytesCell(row.physicalBytes), formatBytesCell(row.deduplicatedSavingsBytes), row.activeFileCatalogRefsCount, row.groupPostRefsCount, row.isPinned],
    ),
    '',
    '## Pinned Storage Objects',
    '',
    renderTable(
      ['Storage ID', 'Physical bytes', 'Content rows', 'Users', 'Remote pins', 'Pin accounts', 'Services'],
      data.pinnedStorageObjects,
      row => [row.storageId, formatBytesCell(row.physicalBytes), row.contentRowsCount, row.usersCount, row.remotePinsCount, row.pinAccountsCount, row.pinServices],
    ),
    '',
    '## Preview Storage',
    '',
    renderTable(
      ['Preview field', 'Content rows', 'Storage rows', 'Unique IDs', 'Registered IDs', 'Unregistered IDs', 'Logical bytes', 'Physical bytes'],
      data.previewStorage,
      row => [row.previewField, row.contentRowsCount, row.storageObjectRowsCount, row.uniqueStorageIdsCount, row.registeredStorageObjectsCount, row.unregisteredStorageIdsCount, formatBytesCell(row.logicalPreviewBytes), formatBytesCell(row.physicalPreviewBytes)],
    ),
    '',
    '## Availability Signals',
    '',
    renderTable(
      ['Storage ID', 'Physical bytes', 'Content rows', 'Users', 'Catalog refs', 'Post refs', 'Generated refs', 'Local pins', 'Remote pins', 'Max peers', 'Max full peers', 'Latest signal'],
      data.availabilitySignals,
      row => [row.storageId, formatBytesCell(row.physicalBytes), row.contentRowsCount, row.usersCount, row.activeFileCatalogRefsCount, row.groupPostRefsCount, row.generatedOutputRefsCount, row.localPinRefsCount, row.remotePinsCount, row.maxPeerCount, row.maxFullyPeerCount, formatDateCell(row.latestSignalAt)],
    ),
    '',
    '## Availability Network Sample Summary',
    '',
    renderTable(
      ['Storage ID', 'Samples', 'Provider OK', 'Retrieval OK', 'Max providers', 'Latest providers', 'Latest retrieval OK', 'Latest measured bytes', 'First sampled', 'Latest sampled'],
      data.availabilityNetworkSampleSummary,
      row => [row.storageId, row.samplesCount, row.providerLookupOkCount, row.retrievalStatOkCount, row.maxProvidersCount, row.latestProvidersCount, row.latestRetrievalStatOk, formatBytesCell(row.latestRetrievalMeasuredBytes), formatDateCell(row.firstSampledAt), formatDateCell(row.latestSampledAt)],
    ),
    '',
  ].join('\n');
}

function renderOverviewTable(overview) {
  const rows = [
    ['Content rows', overview.contentRowsCount],
    ['Content storage objects', overview.contentStorageObjectsCount],
    ['Logical content bytes', formatBytesCell(overview.logicalContentBytes)],
    ['Physical content bytes', formatBytesCell(overview.physicalContentBytes)],
    ['Duplicate storage IDs', overview.duplicateStorageIdsCount],
    ['Duplicate content rows', overview.duplicateContentRowsCount],
    ['File-catalog items', overview.fileCatalogItemsCount],
    ['File-catalog logical bytes', formatBytesCell(overview.fileCatalogLogicalBytes)],
    ['Group posts', overview.groupPostsCount],
    ['Group posts logical bytes', formatBytesCell(overview.groupPostsLogicalBytes)],
    ['Pinned storage objects', overview.pinnedStorageObjectsCount],
    ['Pinned physical bytes', formatBytesCell(overview.pinnedPhysicalBytes)],
    ['Remote pinned storage objects', overview.remotePinnedStorageObjectsCount],
    ['Remote pin refs', overview.remotePinRefsCount],
    ['Generated-output storage refs', overview.generatedOutputStorageRefsCount],
    ['Generated-output unique storage IDs', overview.generatedOutputUniqueStorageIdsCount],
    ['Generated-output known storage objects', overview.generatedOutputKnownStorageObjectsCount],
    ['Generated-output known physical bytes', formatBytesCell(overview.generatedOutputKnownPhysicalBytes)],
    ['Generated-output unknown storage IDs', overview.generatedOutputUnknownStorageIdsCount],
  ];

  return renderTable(['Metric', 'Value'], rows, row => row);
}

function renderTable(headers: string[], rows: any[], getCells: (row: any) => any[]) {
  if (!rows.length) {
    return '_No rows._';
  }

  return [
    `| ${headers.map(escapeTableCell).join(' |')} |`,
    `| ${headers.map(() => '---').join(' |')} |`,
    ...rows.map((row) => {
      return `| ${getCells(row).map(escapeTableCell).join(' |')} |`;
    }),
  ].join('\n');
}

function escapeTableCell(value) {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatBytesCell(value) {
  const bytes = Number(value || 0);
  return `${bytes} (${formatBytes(bytes)})`;
}

function formatDateCell(value) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value = value / 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
