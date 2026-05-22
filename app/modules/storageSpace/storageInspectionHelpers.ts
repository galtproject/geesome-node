import {Op} from 'sequelize';
import {CID} from 'multiformats/cid';
import {IGeesomeApp} from "../../interface.js";
import {ContentStorageType, StorageObjectReferenceType} from "../database/interface.js";
import IGeesomeStorageModule from "../storage/interface.js";
import {
  IStorageSpaceAvailabilityNetworkSignalInspectionRow,
  IStorageSpaceAvailabilityProviderRow,
  IStorageSpaceAvailabilitySignalRow,
  IStorageSpaceGeneratedOutputChildInspectionRow,
  IStorageSpaceGeneratedOutputChildReconcileRow,
  IStorageSpaceGeneratedOutputChildRefInspectionRow,
  IStorageSpaceGeneratedOutputInspectionRow,
  IStorageSpaceGeneratedOutputReconcileRow,
  IStorageSpaceGeneratedOutputRefRow
} from "./interface.js";

export async function inspectStorageSpaceGeneratedOutputRef(storage: IGeesomeStorageModule, ref: IStorageSpaceGeneratedOutputRefRow) {
  try {
    const stat = await storage.getFileStat(ref.storageId, {
      attempts: 1,
      attemptTimeout: 5000,
      withLocal: true,
      size: true,
    });
    return {
      ...ref,
      ok: true,
      type: stat?.type || null,
      measuredBytes: getStorageStatMeasuredBytes(stat),
      statSize: parseStorageStatNumber(stat?.size),
      cumulativeSize: parseStorageStatNumber(stat?.cumulativeSize),
      blocksSize: parseStorageStatNumber(stat?.blocksSize),
      errorMessage: null,
    };
  } catch (e) {
    return getFailedGeneratedOutputInspection(ref, e);
  }
}

export async function inspectStorageSpaceAvailabilityNetworkSignal(
  storage: IGeesomeStorageModule,
  signal: IStorageSpaceAvailabilitySignalRow,
  options: any = {}
): Promise<IStorageSpaceAvailabilityNetworkSignalInspectionRow> {
  const providerResult = await inspectStorageSpaceAvailabilityProviders(storage, signal.storageId, options);
  const retrievalStatResult = await inspectStorageSpaceAvailabilityRetrievalStat(storage, signal.storageId, options);
  return {
    ...signal,
    ...providerResult,
    ...retrievalStatResult,
  };
}

export async function inspectStorageSpaceGeneratedOutputChildRefs(
  app: IGeesomeApp,
  ref: IStorageSpaceGeneratedOutputRefRow,
  options: any
) {
  const inspectOptions = getGeneratedOutputChildInspectionOptions(options);
  const parentInspection = await inspectStorageSpaceGeneratedOutputRef(app.ms.storage, ref);
  if (!parentInspection.ok) {
    return getGeneratedOutputChildInspection(parentInspection, inspectOptions, getEmptyGeneratedOutputChildTraversalResult());
  }

  const traversalResult = await getGeneratedOutputChildTraversal(app, ref, inspectOptions);
  return getGeneratedOutputChildInspection(parentInspection, inspectOptions, traversalResult);
}

export async function reconcileStorageSpaceGeneratedOutputRef(
  app: IGeesomeApp,
  inspection: IStorageSpaceGeneratedOutputInspectionRow
) {
  if (!inspection.ok) {
    return {
      ...inspection,
      reconciled: false,
      storageObjectId: null,
    };
  }
  const storageObject = await app.ms.database.syncStorageObject({
    storageId: inspection.storageId,
    storageType: ContentStorageType.IPFS,
    size: inspection.measuredBytes,
  });
  return {
    ...inspection,
    reconciled: !!storageObject,
    storageObjectId: storageObject?.id || null,
  };
}

export async function reconcileStorageSpaceGeneratedOutputChildRef(
  app: IGeesomeApp,
  child: IStorageSpaceGeneratedOutputChildRefInspectionRow
) {
  const storageObject = await app.ms.database.syncStorageObject({
    storageId: child.storageId,
    storageType: ContentStorageType.IPFS,
    size: child.measuredBytes,
  });
  return {
    ...child,
    reconciled: !!storageObject,
    storageObjectId: storageObject?.id || child.storageObjectId || null,
  };
}

export async function replaceStorageSpaceGeneratedOutputChildReferences(
  app: IGeesomeApp,
  inspection: IStorageSpaceGeneratedOutputChildInspectionRow,
  children: IStorageSpaceGeneratedOutputChildReconcileRow[]
) {
  if (!shouldReplaceStorageSpaceGeneratedOutputChildReferences(inspection)) {
    return [];
  }
  if (children.some(child => !child.reconciled)) {
    return [];
  }
  const rows = [];
  const childrenByParent = getGeneratedOutputChildRowsByParent(children);
  for (const parentStorageId of getInspectedGeneratedOutputParentStorageIds(inspection)) {
    rows.push(...await app.ms.database.replaceStorageObjectReferences(
      parentStorageId,
      StorageObjectReferenceType.GeneratedOutputChild,
      getGeneratedOutputChildReferenceRows(childrenByParent.get(parentStorageId) || [])
    ));
  }
  return rows;
}

export function getStorageSpaceGeneratedOutputReconcileResult(rows: IStorageSpaceGeneratedOutputReconcileRow[]) {
  return {
    rows,
    inspected: rows.length,
    reconciled: rows.filter(row => row.reconciled).length,
    failed: rows.filter(row => !row.ok).length,
    skipped: rows.filter(row => row.ok && !row.reconciled).length,
  };
}

export function getStorageSpaceGeneratedOutputChildReconcileResult(
  inspectedParents: number,
  rows: IStorageSpaceGeneratedOutputChildReconcileRow[]
) {
  return {
    rows,
    inspectedParents,
    inspectedChildren: rows.length,
    reconciled: rows.filter(row => row.reconciled).length,
    skipped: rows.filter(row => !row.reconciled).length,
  };
}

async function inspectStorageSpaceAvailabilityProviders(storage: IGeesomeStorageModule, storageId: string, options: any) {
  const startedAt = Date.now();
  try {
    const result = await collectStorageSpaceAvailabilityProviders(storage, storageId, options);
    return {
      providerLookupOk: true,
      providersCount: result.providers.length,
      providersTruncated: result.truncated,
      providerLookupDurationMs: Date.now() - startedAt,
      providerLookupErrorMessage: null,
      providers: result.providers,
    };
  } catch (e) {
    return {
      providerLookupOk: false,
      providersCount: 0,
      providersTruncated: false,
      providerLookupDurationMs: Date.now() - startedAt,
      providerLookupErrorMessage: getStorageInspectionErrorMessage(e),
      providers: [],
    };
  }
}

async function inspectStorageSpaceAvailabilityRetrievalStat(storage: IGeesomeStorageModule, storageId: string, options: any) {
  const startedAt = Date.now();
  try {
    const stat = await storage.getFileStat(storageId, {
      attempts: 1,
      attemptTimeout: options.statTimeoutMs,
      withLocal: options.statWithLocal,
      size: true,
    });
    return {
      retrievalStatOk: true,
      retrievalStatDurationMs: Date.now() - startedAt,
      retrievalType: stat?.type || null,
      retrievalMeasuredBytes: getStorageStatMeasuredBytes(stat),
      retrievalErrorMessage: null,
    };
  } catch (e) {
    return {
      retrievalStatOk: false,
      retrievalStatDurationMs: Date.now() - startedAt,
      retrievalType: null,
      retrievalMeasuredBytes: 0,
      retrievalErrorMessage: getStorageInspectionErrorMessage(e),
    };
  }
}

async function collectStorageSpaceAvailabilityProviders(storage: IGeesomeStorageModule, storageId: string, options: any) {
  const providerLimit = options.providerLimit || 20;
  const providerAddressLimit = options.providerAddressLimit || 5;
  const timeout = getTimeoutController(options.providerTimeoutMs || 5000);
  const providers: IStorageSpaceAvailabilityProviderRow[] = [];
  const providerKeys = new Set<string>();
  let truncated = false;

  try {
    const iterator = getStorageSpaceProviderIterator(storage, storageId, {
      providerLimit,
      signal: timeout.signal,
    });
    for await (const event of iterator) {
      for (const provider of getStorageSpaceProviderRowsFromEvent(event, providerAddressLimit)) {
        const providerKey = getStorageSpaceProviderKey(provider);
        if (providerKeys.has(providerKey)) {
          continue;
        }
        providers.push(provider);
        providerKeys.add(providerKey);
        if (providers.length >= providerLimit) {
          truncated = true;
          timeout.abort();
          return {providers, truncated};
        }
      }
    }
    return {providers, truncated};
  } finally {
    timeout.clear();
  }
}

function getStorageSpaceProviderIterator(storage: IGeesomeStorageModule, storageId: string, options: any) {
  const node: any = storage?.node;
  if (node?.routing?.findProvs) {
    return node.routing.findProvs(storageId, {
      numProviders: options.providerLimit,
      signal: options.signal,
    });
  }
  if (node?.routing?.findProviders) {
    return node.routing.findProviders(parseStorageSpaceCid(storageId), {
      signal: options.signal,
    });
  }
  if (node?.dht?.findProvs) {
    return node.dht.findProvs(storageId, {
      numProviders: options.providerLimit,
      signal: options.signal,
    });
  }
  if (node?.dht?.findProviders) {
    return node.dht.findProviders(parseStorageSpaceCid(storageId), {
      signal: options.signal,
    });
  }
  throw new Error('storage_provider_lookup_not_supported');
}

function getStorageSpaceProviderRowsFromEvent(event, providerAddressLimit: number): IStorageSpaceAvailabilityProviderRow[] {
  return getStorageSpaceProviderCandidates(event)
    .map(provider => getStorageSpaceProviderRow(provider, event, providerAddressLimit))
    .filter(provider => !!provider);
}

function getStorageSpaceProviderCandidates(event) {
  const providers = [];
  if (event?.provider) {
    providers.push(event.provider);
  }
  if (Array.isArray(event?.providers)) {
    providers.push(...event.providers);
  }
  if (Array.isArray(event?.responses)) {
    providers.push(...event.responses);
  }
  if (Array.isArray(event?.Responses)) {
    providers.push(...event.Responses);
  }
  if (isStorageSpaceProviderLike(event)) {
    providers.push(event);
  }
  return providers;
}

function getStorageSpaceProviderRow(provider, event, providerAddressLimit: number): IStorageSpaceAvailabilityProviderRow | null {
  const id = normalizeStorageSpaceProviderId(provider?.id ?? provider?.ID ?? provider?.peer ?? provider?.peerId);
  const multiaddrs = normalizeStorageSpaceProviderMultiaddrs(
    provider?.multiaddrs ?? provider?.addrs ?? provider?.Addrs,
    providerAddressLimit
  );
  if (!id && !multiaddrs.length) {
    return null;
  }
  return {
    id,
    multiaddrs,
    protocols: normalizeStorageSpaceProviderProtocols(provider?.protocols),
    source: normalizeStorageSpaceProviderSource(provider, event),
  };
}

function getStorageSpaceProviderKey(provider: IStorageSpaceAvailabilityProviderRow) {
  return `${provider.id || ''}|${provider.multiaddrs.join(',')}`;
}

function normalizeStorageSpaceProviderId(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
}

function normalizeStorageSpaceProviderMultiaddrs(value, limit: number) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return values
    .map(address => normalizeStorageSpaceProviderAddress(address))
    .filter(address => !!address)
    .slice(0, limit);
}

function normalizeStorageSpaceProviderAddress(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
}

function normalizeStorageSpaceProviderProtocols(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(protocol => String(protocol));
}

function normalizeStorageSpaceProviderSource(provider, event) {
  return provider?.routing || event?.routing || event?.type || event?.name || null;
}

function isStorageSpaceProviderLike(event) {
  return !!(event?.id || event?.ID || event?.peer || event?.peerId || event?.multiaddrs || event?.addrs || event?.Addrs);
}

function parseStorageSpaceCid(storageId: string) {
  return CID.parse(storageId);
}

function getTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    clear: () => clearTimeout(timeout),
  };
}

async function getKnownStorageObjectsByStorageId(app: IGeesomeApp, storageIds: string[]) {
  if (!storageIds.length) {
    return new Map();
  }
  const rows = await app.ms.database.models.StorageObject.findAll({
    where: {storageId: {[Op.in]: [...new Set(storageIds)]}},
  });
  return new Map(rows.map(row => {
    const storageObject = typeof row.toJSON === 'function' ? row.toJSON() : row;
    return [storageObject.storageId, storageObject];
  }));
}

function getGeneratedOutputChildRow(
  ref: IStorageSpaceGeneratedOutputRefRow,
  entry,
  parent: any = {storageId: ref.storageId, depth: 0, path: ''}
): IStorageSpaceGeneratedOutputChildRefInspectionRow {
  const statSize = parseStorageStatNumber(entry?.size);
  const cumulativeSize = parseStorageStatNumber(entry?.cumulativeSize);
  const blocksSize = parseStorageStatNumber(entry?.blocksSize);
  const name = normalizeStorageLsEntryName(entry);
  return {
    source: ref.source,
    parentStorageId: parent.storageId,
    storageId: normalizeStorageId(entry?.cid || entry?.hash || entry?.Hash || entry?.path),
    depth: parent.depth + 1,
    path: getGeneratedOutputChildPath(parent.path, name),
    name,
    type: normalizeStorageLsEntryType(entry),
    measuredBytes: getStorageStatMeasuredBytes(entry),
    statSize,
    cumulativeSize,
    blocksSize,
    knownStorageObject: false,
    storageObjectId: null,
    storageObjectBytes: null,
  };
}

function getGeneratedOutputChildInspection(
  parentInspection: IStorageSpaceGeneratedOutputInspectionRow,
  options: any,
  traversalResult: any
): IStorageSpaceGeneratedOutputChildInspectionRow {
  const children = traversalResult.children;
  const knownChildren = children.filter(child => child.knownStorageObject);
  const unknownChildren = children.filter(child => !child.knownStorageObject);
  return {
    ...parentInspection,
    childLimit: options.childLimit,
    depthLimit: options.depthLimit,
    nodeLimit: options.nodeLimit,
    childrenCount: traversalResult.childrenCount,
    inspectedChildrenCount: children.length,
    inspectedParentStorageIds: traversalResult.inspectedParentStorageIds,
    knownChildrenCount: knownChildren.length,
    unknownChildrenCount: unknownChildren.length,
    childMeasuredBytes: sumStorageBytes(children.map(child => child.measuredBytes)),
    knownChildPhysicalBytes: sumStorageBytes(knownChildren.map(child => child.storageObjectBytes ?? child.measuredBytes)),
    unknownChildMeasuredBytes: sumStorageBytes(unknownChildren.map(child => child.measuredBytes)),
    childrenTruncated: traversalResult.childrenTruncated,
    childErrorMessage: traversalResult.childErrorMessage,
    children,
  };
}

async function getGeneratedOutputChildTraversal(app: IGeesomeApp, ref: IStorageSpaceGeneratedOutputRefRow, options) {
  const traversal = getEmptyGeneratedOutputChildTraversalResult();
  try {
    await collectGeneratedOutputChildRows(app, ref, {
      storageId: ref.storageId,
      depth: 0,
      path: '',
    }, options, traversal);
  } catch (e) {
    traversal.childErrorMessage = getStorageInspectionErrorMessage(e);
  }
  if (!traversal.children.length) {
    return traversal;
  }
  traversal.children = await hydrateGeneratedOutputChildRows(app, traversal.children);
  return traversal;
}

async function collectGeneratedOutputChildRows(app: IGeesomeApp, ref: IStorageSpaceGeneratedOutputRefRow, parent, options, traversal) {
  if (parent.depth >= options.depthLimit) {
    return;
  }
  if (traversal.children.length >= options.nodeLimit) {
    traversal.childrenTruncated = true;
    return;
  }
  traversal.inspectedParentStorageIds.push(parent.storageId);
  const childEntries = normalizeStorageLsEntries(await app.ms.storage.nodeLs(parent.storageId));
  traversal.childrenCount += childEntries.length;
  const nextEntries = getGeneratedOutputChildEntriesWithinLimits(childEntries, options, traversal);
  for (const entry of nextEntries) {
    const child = getGeneratedOutputChildRow(ref, entry, parent);
    if (!child.storageId) {
      continue;
    }
    traversal.children.push(child);
    if (!shouldInspectGeneratedOutputChild(child, options, traversal)) {
      continue;
    }
    await collectGeneratedOutputChildRows(app, ref, {
      storageId: child.storageId,
      depth: child.depth,
      path: child.path || '',
    }, options, traversal);
  }
}

async function hydrateGeneratedOutputChildRows(app: IGeesomeApp, childRows: IStorageSpaceGeneratedOutputChildRefInspectionRow[]) {
  const knownStorageObjects = await getKnownStorageObjectsByStorageId(app, childRows.map(row => row.storageId));
  return childRows.map((row) => {
    const storageObject = knownStorageObjects.get(row.storageId);
    if (!storageObject) {
      return row;
    }
    return {
      ...row,
      knownStorageObject: true,
      storageObjectId: storageObject.id || null,
      storageObjectBytes: parseStorageStatNumber(storageObject.size),
    };
  });
}

function getEmptyGeneratedOutputChildTraversalResult() {
  return {
    children: [],
    childrenCount: 0,
    inspectedParentStorageIds: [],
    childrenTruncated: false,
    childErrorMessage: null,
  };
}

function getGeneratedOutputChildEntriesWithinLimits(childEntries, options, traversal) {
  const remainingNodeLimit = options.nodeLimit - traversal.children.length;
  const limit = Math.min(options.childLimit, Math.max(remainingNodeLimit, 0));
  const nextEntries = childEntries.slice(0, limit);
  if (childEntries.length > nextEntries.length) {
    traversal.childrenTruncated = true;
  }
  return nextEntries;
}

function shouldInspectGeneratedOutputChild(child: IStorageSpaceGeneratedOutputChildRefInspectionRow, options, traversal) {
  if (traversal.children.length >= options.nodeLimit) {
    traversal.childrenTruncated = true;
    return false;
  }
  if (child.depth >= options.depthLimit) {
    return false;
  }
  return isStorageDirectoryType(child.type);
}

function getFailedGeneratedOutputInspection(ref: IStorageSpaceGeneratedOutputRefRow, error) {
  return {
    ...ref,
    ok: false,
    type: null,
    measuredBytes: 0,
    statSize: 0,
    cumulativeSize: 0,
    blocksSize: 0,
    errorMessage: getStorageInspectionErrorMessage(error),
  };
}

function normalizeStorageLsEntries(entries) {
  if (!entries) {
    return [];
  }
  if (Array.isArray(entries)) {
    return entries;
  }
  if (Array.isArray(entries.entries)) {
    return entries.entries;
  }
  return [entries];
}

function normalizeStorageId(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toString === 'function') {
    return value.toString();
  }
  return String(value);
}

function getGeneratedOutputChildInspectionOptions(options: any = {}) {
  return {
    childLimit: options.childLimit || 50,
    depthLimit: options.depthLimit || 1,
    nodeLimit: options.nodeLimit || options.childLimit || 50,
  };
}

function getGeneratedOutputChildRowsByParent(children: IStorageSpaceGeneratedOutputChildReconcileRow[]) {
  const childrenByParent = new Map<string, IStorageSpaceGeneratedOutputChildReconcileRow[]>();
  for (const child of children) {
    const parentRows = childrenByParent.get(child.parentStorageId) || [];
    parentRows.push(child);
    childrenByParent.set(child.parentStorageId, parentRows);
  }
  return childrenByParent;
}

function getInspectedGeneratedOutputParentStorageIds(inspection: IStorageSpaceGeneratedOutputChildInspectionRow) {
  if (inspection.inspectedParentStorageIds?.length) {
    return [...new Set(inspection.inspectedParentStorageIds)];
  }
  return [inspection.storageId];
}

function getGeneratedOutputChildReferenceRows(children: IStorageSpaceGeneratedOutputChildReconcileRow[]) {
  return children
    .filter(child => child.reconciled && child.storageId)
    .map(child => ({
      targetStorageId: child.storageId,
      source: child.source,
      name: child.name,
      targetType: child.type,
      targetSize: child.measuredBytes,
    }));
}

function getGeneratedOutputChildPath(parentPath, name) {
  if (!name) {
    return parentPath || null;
  }
  if (!parentPath) {
    return name;
  }
  return `${parentPath}/${name}`;
}

function shouldReplaceStorageSpaceGeneratedOutputChildReferences(inspection: IStorageSpaceGeneratedOutputChildInspectionRow) {
  if (!inspection.ok) {
    return false;
  }
  if (inspection.childErrorMessage) {
    return false;
  }
  if (inspection.childrenTruncated) {
    return false;
  }
  return true;
}

function isStorageDirectoryType(type) {
  return type === 'directory' || type === 'dir';
}

function normalizeStorageLsEntryName(entry) {
  if (typeof entry?.name === 'string') {
    return entry.name;
  }
  if (typeof entry?.path === 'string') {
    return entry.path.split('/').filter(Boolean).pop() || null;
  }
  return null;
}

function normalizeStorageLsEntryType(entry) {
  if (typeof entry?.type === 'string') {
    return entry.type;
  }
  if (typeof entry?.type === 'number') {
    return entry.type === 1 ? 'directory' : 'file';
  }
  return null;
}

function getStorageStatMeasuredBytes(stat) {
  return parseStorageStatNumber(
    stat?.cumulativeSize ?? stat?.size ?? stat?.fileSize ?? stat?.blocksSize
  );
}

function parseStorageStatNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function getStorageInspectionErrorMessage(error) {
  return error?.message || String(error);
}

function sumStorageBytes(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}
