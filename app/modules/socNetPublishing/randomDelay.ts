import {randomInt} from 'node:crypto';
import {Op} from 'sequelize';

// Caller holds the destination UPDATE lock, then the job lock. One draw per
// destination per minute prevents concurrent workers and overdue posts racing.
export function createRandomDelayGate(Destination, options: any = {}) {
	const now = options.randomDelayNow || Date.now;
	const draw = options.randomDelayDraw || (() => randomInt(10));
	return {
		readyWhere() {
			const sequelize = Destination.sequelize;
			const table = sequelize.getQueryInterface().queryGenerator.quoteTable(Destination.getTableName());
			const available = sequelize.literal(`(SELECT "id" FROM ${table} WHERE "randomDelayEnabled"=false OR "randomDelayNextCheckAt" IS NULL OR "randomDelayNextCheckAt"<=${sequelize.escape(new Date(now()))})`);
			return {[Op.or]: [{destinationId: null}, {destinationId: {[Op.in]: available}}, {status: 'processing'}]};
		},
		async allow(job, destination, transaction) {
			if (!destination?.randomDelayEnabled || job.status !== 'queued') {
				return true;
			}
			const time = now();
			if (destination.randomDelayNextCheckAt && new Date(destination.randomDelayNextCheckAt).getTime() > time) {
				return false;
			}
			await destination.update({randomDelayNextCheckAt: new Date(time + 60000)}, {transaction});
			return draw() === 0;
		}
	};
}
