import {Op} from 'sequelize';
import {IGeesomeApp} from "../../interface.js";
import {ContentStorageType} from "../database/interface.js";
import IGeesomeStorageModule from "../storage/interface.js";
import {
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

export async function inspectStorageSpaceGeneratedOutputChildRefs(
  app: IGeesomeApp,
  ref: IStorageSpaceGeneratedOutputRefRow,
  childLimit: number
) {
  const parentInspection = await inspectStorageSpaceGeneratedOutputRef(app.ms.storage, ref);
  if (!parentInspection.ok) {
    return getGeneratedOutputChildInspection(parentInspection, childLimit, [], 0);
  }

  try {
    const childEntries = normalizeStorageLsEntries(await app.ms.storage.nodeLs(ref.storageId));
    const childRows = await getGeneratedOutputChildRows(app, ref, childEntries.slice(0, childLimit));
    return getGeneratedOutputChildInspection(parentInspection, childLimit, childRows, childEntries.length);
  } catch (e) {
    return getGeneratedOutputChildInspection(parentInspection, childLimit, [], 0, getStorageInspectionErrorMessage(e));
  }
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

async function getGeneratedOutputChildRows(app: IGeesomeApp, ref: IStorageSpaceGeneratedOutputRefRow, childEntries) {
  const childRows = childEntries
    .map(entry => getGeneratedOutputChildRow(ref, entry))
    .filter(row => row.storageId);
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
  entry
): IStorageSpaceGeneratedOutputChildRefInspectionRow {
  const statSize = parseStorageStatNumber(entry?.size);
  const cumulativeSize = parseStorageStatNumber(entry?.cumulativeSize);
  const blocksSize = parseStorageStatNumber(entry?.blocksSize);
  return {
    source: ref.source,
    parentStorageId: ref.storageId,
    storageId: normalizeStorageId(entry?.cid || entry?.hash || entry?.Hash || entry?.path),
    name: normalizeStorageLsEntryName(entry),
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
  childLimit: number,
  children: IStorageSpaceGeneratedOutputChildRefInspectionRow[],
  childrenCount: number,
  childErrorMessage: string | null = null
): IStorageSpaceGeneratedOutputChildInspectionRow {
  const knownChildren = children.filter(child => child.knownStorageObject);
  const unknownChildren = children.filter(child => !child.knownStorageObject);
  return {
    ...parentInspection,
    childLimit,
    childrenCount,
    inspectedChildrenCount: children.length,
    knownChildrenCount: knownChildren.length,
    unknownChildrenCount: unknownChildren.length,
    childMeasuredBytes: sumStorageBytes(children.map(child => child.measuredBytes)),
    knownChildPhysicalBytes: sumStorageBytes(knownChildren.map(child => child.storageObjectBytes ?? child.measuredBytes)),
    unknownChildMeasuredBytes: sumStorageBytes(unknownChildren.map(child => child.measuredBytes)),
    childrenTruncated: childrenCount > children.length,
    childErrorMessage,
    children,
  };
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
