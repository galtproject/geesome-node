import {QueryTypes, Sequelize} from 'sequelize';

export type ScalabilityTargetGroupSelector = {
  groupId: number | null;
  groupName: string;
};

export type ScalabilityTargetGroup = {
  id: number;
  name: string;
  creatorId: number;
  manifestStaticStorageId: string | null;
};

export function parseOptionalPositiveInteger(value: string | undefined, envName: string): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer when set.`);
  }

  return parsed;
}

export function getScalabilityTargetGroupSelector(defaultGroupName = 'scalability-fixture'): ScalabilityTargetGroupSelector {
  return {
    groupId: parseOptionalPositiveInteger(process.env.FIXTURE_GROUP_ID, 'FIXTURE_GROUP_ID'),
    groupName: process.env.FIXTURE_GROUP_NAME || defaultGroupName,
  };
}

export function describeScalabilityTargetGroup(selector: ScalabilityTargetGroupSelector): string {
  if (selector.groupId !== null) {
    return `group id ${selector.groupId}`;
  }

  return `group name "${selector.groupName}"`;
}

export function renderScalabilityTargetGroupEnv(selector: ScalabilityTargetGroupSelector): string {
  if (selector.groupId !== null) {
    return `FIXTURE_GROUP_ID=${selector.groupId}`;
  }

  return `FIXTURE_GROUP_NAME=${selector.groupName}`;
}

export async function getScalabilityTargetGroup(
  sequelize: Sequelize,
  selector: ScalabilityTargetGroupSelector,
): Promise<ScalabilityTargetGroup> {
  const columns = `id, name, "creatorId", "manifestStaticStorageId"`;
  const group = selector.groupId !== null
    ? await getGroupById(sequelize, columns, selector.groupId)
    : await getGroupByName(sequelize, columns, selector.groupName);

  if (!group) {
    throw new Error(
      `fixture/restored ${describeScalabilityTargetGroup(selector)} not found. Run 'npm run database:scalability:fixture' first or set FIXTURE_GROUP_ID/FIXTURE_GROUP_NAME to an existing group.`,
    );
  }

  return group;
}

async function getGroupById(sequelize: Sequelize, columns: string, id: number): Promise<ScalabilityTargetGroup | null> {
  const [group] = (await sequelize.query(
    `SELECT ${columns} FROM groups WHERE id = :id LIMIT 1`,
    {replacements: {id}, type: QueryTypes.SELECT},
  )) as ScalabilityTargetGroup[];

  return group || null;
}

async function getGroupByName(sequelize: Sequelize, columns: string, name: string): Promise<ScalabilityTargetGroup | null> {
  const [group] = (await sequelize.query(
    `SELECT ${columns} FROM groups WHERE name = :name ORDER BY id ASC LIMIT 1`,
    {replacements: {name}, type: QueryTypes.SELECT},
  )) as ScalabilityTargetGroup[];

  return group || null;
}
