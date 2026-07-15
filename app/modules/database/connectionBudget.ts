import {QueryTypes} from 'sequelize';
import helpers from '../../helpers.js';

const defaultPoolMax = 20;
const defaultProcessCount = 1;
const defaultAuxiliaryConnections = 5;
const defaultReserveConnections = 10;

export type DatabaseConnectionBudget = {
	poolMax: number;
	processCount: number;
	auxiliaryConnections: number;
	reserveConnections: number;
	plannedConnections: number;
	serverMaxConnections: number;
	usableConnections: number;
	isPossible: boolean;
};

export async function validateDatabaseConnectionBudget(
	sequelize,
	env = process.env,
	warn: (...args: any[]) => void = console.warn
): Promise<DatabaseConnectionBudget | null> {
	if (!helpers.parseBoolean(env.DATABASE_CONNECTION_BUDGET_CHECK, true)) {
		return null;
	}

	try {
		const rows = await sequelize.query(
			`SELECT current_setting('max_connections')::integer AS "maxConnections"`,
			{type: QueryTypes.SELECT}
		);
		const serverMaxConnections = parsePositiveInteger(rows?.[0]?.maxConnections, 0);
		if (!serverMaxConnections) {
			return null;
		}

		const budget = createDatabaseConnectionBudget(sequelize, serverMaxConnections, env);
		if (!budget.isPossible) {
			warn(getDatabaseConnectionBudgetWarning(budget));
		}
		return budget;
	} catch (_error) {
		return null;
	}
}

function createDatabaseConnectionBudget(sequelize, serverMaxConnections, env): DatabaseConnectionBudget {
	const poolMax = parsePositiveInteger(sequelize?.options?.pool?.max, defaultPoolMax);
	const processCount = parsePositiveInteger(env.DATABASE_PROCESS_COUNT, defaultProcessCount);
	const auxiliaryConnections = parseNonNegativeInteger(
		env.DATABASE_AUXILIARY_CONNECTIONS,
		defaultAuxiliaryConnections
	);
	const reserveConnections = parseNonNegativeInteger(
		env.DATABASE_CONNECTION_RESERVE,
		defaultReserveConnections
	);
	const plannedConnections = poolMax * processCount + auxiliaryConnections;
	const usableConnections = Math.max(0, serverMaxConnections - reserveConnections);

	return {
		poolMax,
		processCount,
		auxiliaryConnections,
		reserveConnections,
		plannedConnections,
		serverMaxConnections,
		usableConnections,
		isPossible: plannedConnections <= usableConnections
	};
}

function getDatabaseConnectionBudgetWarning(budget: DatabaseConnectionBudget): string {
	return [
		'database_connection_budget_exceeded',
		`planned=${budget.plannedConnections}`,
		`usable=${budget.usableConnections}`,
		`pool_max=${budget.poolMax}`,
		`process_count=${budget.processCount}`,
		`auxiliary=${budget.auxiliaryConnections}`,
		`reserve=${budget.reserveConnections}`,
		`server_max=${budget.serverMaxConnections}`
	].join(' ');
}

function parsePositiveInteger(value, fallback): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return parsed;
}

function parseNonNegativeInteger(value, fallback): number {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return fallback;
	}
	return parsed;
}
