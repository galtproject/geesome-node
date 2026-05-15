import {pathToFileURL} from 'node:url';
import {QueryTypes, Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

type DerivedStateIntegrityOptions = {
  groupId?: number;
  postId?: number;
  sampleLimit?: number;
};

type IssueCheck = {
  name: string;
  title: string;
  countSql: string;
  sampleSql: string;
  replacements: Record<string, any>;
};

export type DerivedStateIssue = {
  name: string;
  title: string;
  count: number;
  samples: any[];
};

export type DerivedStateIntegrityReport = {
  generatedAt: string;
  database: string;
  issues: DerivedStateIssue[];
};

type CountRow = {
  count: string | number;
};

const defaultSampleLimit = 10;
const defaultRepairLimit = 50;
const defaultStorageRepo = process.env.STORAGE_REPO;
const derivedStateAppModules = [
  'drivers',
  'database',
  'api',
  'accountStorage',
  'communicator',
  'storage',
  'content',
  'staticId',
  'group',
  'entityJsonManifest',
];

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number.parseInt(value as any, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid_positive_integer:${value}`);
  }
  return parsed;
}

function getOptionsFromEnv(): DerivedStateIntegrityOptions {
  return {
    groupId: parseOptionalPositiveInteger(process.env.DERIVED_STATE_GROUP_ID || process.env.RESTORED_GROUP_ID),
    postId: parseOptionalPositiveInteger(process.env.DERIVED_STATE_POST_ID),
    sampleLimit: parsePositiveInteger(process.env.DERIVED_STATE_SAMPLE_LIMIT, defaultSampleLimit),
  };
}

function getPostScope(options: DerivedStateIntegrityOptions, alias = 'p') {
  const clauses = [
    `${alias}.status = 'published'`,
    `COALESCE(${alias}."isDeleted", false) = false`,
  ];
  const replacements: Record<string, any> = {};
  if (options.groupId) {
    clauses.push(`${alias}."groupId" = :groupId`);
    replacements.groupId = options.groupId;
  }
  if (options.postId) {
    clauses.push(`${alias}.id = :postId`);
    replacements.postId = options.postId;
  }
  return {
    sql: clauses.join('\n        AND '),
    replacements,
  };
}

function getPostIssueCheck(
  options: DerivedStateIntegrityOptions,
  name: string,
  title: string,
  extraWhere: string,
): IssueCheck {
  const scope = getPostScope(options);
  const whereSql = `${scope.sql}
        AND (${extraWhere})`;
  const sampleFields = `
      p.id,
      p."groupId",
      p."userId",
      p."localId",
      p."isRemote",
      p."isEncrypted",
      p."publishedAt",
      p."manifestStorageId",
      p."encryptedManifestStorageId",
      p."directoryStorageId"`;

  return {
    name,
    title,
    replacements: scope.replacements,
    countSql: `
      SELECT COUNT(*)::int AS count
      FROM posts p
      WHERE ${whereSql}
    `,
    sampleSql: `
      SELECT ${sampleFields}
      FROM posts p
      WHERE ${whereSql}
      ORDER BY p.id ASC
      LIMIT :sampleLimit
    `,
  };
}

function getGroupManifestIssueCheck(options: DerivedStateIntegrityOptions): IssueCheck {
  const postScope = getPostScope(options);
  const joinSql = `p."groupId" = g.id
        AND ${postScope.sql}`;
  const whereSql = `COALESCE(g."isDeleted", false) = false
        AND g."manifestStorageId" IS NULL`;

  return {
    name: 'groups_with_published_posts_missing_manifest',
    title: 'Groups with published posts missing manifestStorageId',
    replacements: postScope.replacements,
    countSql: `
      SELECT COUNT(DISTINCT g.id)::int AS count
      FROM groups g
      JOIN posts p
        ON ${joinSql}
      WHERE ${whereSql}
    `,
    sampleSql: `
      SELECT
        g.id,
        g.name,
        g."creatorId",
        COUNT(p.id)::int AS "publishedPosts"
      FROM groups g
      JOIN posts p
        ON ${joinSql}
      WHERE ${whereSql}
      GROUP BY g.id, g.name, g."creatorId"
      ORDER BY g.id ASC
      LIMIT :sampleLimit
    `,
  };
}

function getIssueChecks(options: DerivedStateIntegrityOptions): IssueCheck[] {
  return [
    getPostIssueCheck(
      options,
      'published_posts_missing_local_id',
      'Published posts missing a usable localId',
      'p."localId" IS NULL OR p."localId" <= 0',
    ),
    getPostIssueCheck(
      options,
      'published_posts_missing_public_manifest',
      'Published posts missing manifestStorageId',
      'p."manifestStorageId" IS NULL',
    ),
    getPostIssueCheck(
      options,
      'local_published_posts_missing_directory',
      'Local published posts missing directoryStorageId',
      'COALESCE(p."isRemote", false) = false AND p."directoryStorageId" IS NULL',
    ),
    getPostIssueCheck(
      options,
      'encrypted_published_posts_missing_encrypted_manifest',
      'Encrypted published posts missing encryptedManifestStorageId',
      'p."isEncrypted" = true AND p."encryptedManifestStorageId" IS NULL',
    ),
    getGroupManifestIssueCheck(options),
  ];
}

async function collectIssue(
  sequelize: Sequelize,
  check: IssueCheck,
  sampleLimit: number,
): Promise<DerivedStateIssue> {
  const replacements = {
    ...check.replacements,
    sampleLimit,
  };
  const [[countRow], samples] = await Promise.all([
    sequelize.query(check.countSql, {replacements, type: QueryTypes.SELECT}) as Promise<CountRow[]>,
    sequelize.query(check.sampleSql, {replacements, type: QueryTypes.SELECT}) as Promise<any[]>,
  ]);
  return {
    name: check.name,
    title: check.title,
    count: Number(countRow?.count) || 0,
    samples,
  };
}

export async function collectDatabaseDerivedStateIntegrity(
  sequelize: Sequelize,
  options: DerivedStateIntegrityOptions = {},
): Promise<DerivedStateIntegrityReport> {
  const sampleLimit = parsePositiveInteger(options.sampleLimit, defaultSampleLimit);
  const issues = await Promise.all(
    getIssueChecks(options).map(check => collectIssue(sequelize, check, sampleLimit))
  );

  return {
    generatedAt: new Date().toISOString(),
    database: String((databaseConfig as any).database),
    issues,
  };
}

function renderIssue(issue: DerivedStateIssue): string[] {
  const lines = [
    `${issue.count === 0 ? 'PASS' : 'FAIL'} ${issue.name}: ${issue.count}`,
  ];
  if (issue.count > 0 && issue.samples.length) {
    lines.push(JSON.stringify(issue.samples, null, 2));
  }
  return lines;
}

function renderReport(report: DerivedStateIntegrityReport): string {
  return [
    `Derived state integrity report for ${report.database}`,
    `Generated: ${report.generatedAt}`,
    '',
    ...report.issues.flatMap(renderIssue),
  ].join('\n');
}

function assertRepairSafety() {
  if (process.env.CONFIRM_DERIVED_STATE_REPAIR !== '1') {
    throw new Error('set CONFIRM_DERIVED_STATE_REPAIR=1 to repair derived manifest/static state');
  }
  if (!(databaseConfig as any).database) {
    throw new Error('set DATABASE_NAME before repairing derived state');
  }
  if ((databaseConfig as any).database === 'geesome_node' && process.env.ALLOW_DEFAULT_DATABASE !== '1') {
    throw new Error('refusing to repair DATABASE_NAME=geesome_node without ALLOW_DEFAULT_DATABASE=1');
  }
}

function getStorageConfigOverride() {
  if (!defaultStorageRepo) {
    return {};
  }
  return {
    storageConfig: {
      jsNode: {repo: defaultStorageRepo},
      goNode: {repo: defaultStorageRepo},
    },
  };
}

async function repairDerivedState(options: DerivedStateIntegrityOptions) {
  assertRepairSafety();
  const repairLimit = parsePositiveInteger(process.env.DERIVED_STATE_REPAIR_LIMIT, defaultRepairLimit);
  const appConfig: any = {
    modules: derivedStateAppModules,
    port: Number.parseInt(process.env.DERIVED_STATE_REPAIR_PORT || '0', 10) || 0,
    ...getStorageConfigOverride(),
  };
  const app = await (await import('../app/index.js')).default(appConfig);
  try {
    return await app.ms.group.repairPostManifestDerivedState({
      groupId: options.groupId,
      postId: options.postId,
      limit: repairLimit,
    });
  } finally {
    await app.stop();
  }
}

async function main() {
  const options = getOptionsFromEnv();
  const shouldRepair = process.argv.includes('--repair') || process.env.DERIVED_STATE_REPAIR === '1';
  if (shouldRepair) {
    const repairResult = await repairDerivedState(options);
    console.log(JSON.stringify(repairResult, null, 2));
  }

  const sequelize = new Sequelize({
    ...(databaseConfig as any),
    logging: false,
  });
  try {
    await sequelize.authenticate();
    const report = await collectDatabaseDerivedStateIntegrity(sequelize, options);
    console.log(renderReport(report));
    const failingIssues = report.issues.filter(issue => issue.count > 0);
    if (failingIssues.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await sequelize.close();
  }
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
