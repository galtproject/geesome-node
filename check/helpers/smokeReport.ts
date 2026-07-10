import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

const genericReportPathEnvName = 'GEESOME_SMOKE_REPORT_PATH';

export function printSmokeReport(report, reportPathEnvName = ''): void {
	const payload = `${JSON.stringify(report, null, 2)}\n`;
	process.stdout.write(payload);

	const reportPath = getSmokeReportPath(reportPathEnvName);
	if (!reportPath || reportPath === '-') {
		return;
	}

	const resolvedReportPath = resolve(reportPath);
	mkdirSync(dirname(resolvedReportPath), {recursive: true});
	writeFileSync(resolvedReportPath, payload);
	process.stderr.write(`Smoke report written to ${resolvedReportPath}\n`);
}

export function getSmokeReportPathEnvDescription(reportPathEnvName: string): string {
	if (!reportPathEnvName) {
		return `${genericReportPathEnvName}  Optional JSON report output path`;
	}
	return `${reportPathEnvName} / ${genericReportPathEnvName}  Optional JSON report output path`;
}

function getSmokeReportPath(reportPathEnvName: string): string {
	const specificReportPath = reportPathEnvName ? process.env[reportPathEnvName] : '';
	return String(specificReportPath || process.env[genericReportPathEnvName] || '').trim();
}
