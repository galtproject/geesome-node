import type {Sequelize} from 'sequelize';

export default async function (sequelize: Sequelize, appModels) {
	appModels.ImageCompositionOperation = await (await import('./imageCompositionOperation.js')).default(sequelize, appModels);
	return appModels;
}
