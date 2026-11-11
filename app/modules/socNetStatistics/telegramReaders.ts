import {Op} from 'sequelize';
import {ApiProblemError} from '../api/problem.js';

export function getTelegramReaderMethods(app, Binding, Destination) {
	return {
		async telegramSettings(userId, query: any = {}) {
			const offset = Number(query.offset || 0);
			if (Object.keys(query).some(key => key !== 'offset') || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) {
				throw new ApiProblemError(400, 'social_statistics_input_invalid', 'Invalid page');
			}
			const destinations = await Destination.findAll({where: {userId, network: 'telegram'}, order: [['id', 'ASC']], limit: 101, offset});
			const rows = await Binding.findAll({where: {userId, destinationId: {[Op.in]: destinations.slice(0, 100).map(row => row.id)}}});
			return {accounts: await app.ms.socNetAccount.listTelegramStatisticsAccounts(userId), destinations: destinations.slice(0, 100).map(row => ({id: row.id, label: row.label, chatId: row.target.chatId, accountId: rows.find(binding => binding.destinationId === row.id)?.accountId || null})), nextOffset: destinations.length > 100 ? offset + 100 : null};
		},
		async bindTelegramReader(userId, destinationId, input) {
			const id = Number(destinationId);
			if (!Number.isSafeInteger(id) || id < 1 || !input || Object.keys(input).some(key => key !== 'accountId') || input.accountId !== null && (!Number.isSafeInteger(input.accountId) || input.accountId < 1)) {
				throw new ApiProblemError(400, 'social_statistics_input_invalid', 'Invalid reader account');
			}
			const destination = await Destination.findOne({where: {id, userId, network: 'telegram'}});
			if (!destination) {
				throw new ApiProblemError(404, 'social_statistics_entity_not_found', 'Destination not found');
			}
			if (input.accountId === null) {
				await Binding.destroy({where: {userId, destinationId: id}});
			} else {
				try {
					await app.ms.socNetAccount.assertTelegramStatisticsAccount(userId, input.accountId);
				} catch {
					throw new ApiProblemError(400, 'social_statistics_telegram_account_required', 'Select a usable owned Telegram user account');
				}
				await Binding.upsert({userId, destinationId: id, accountId: input.accountId});
			}
			return {destinationId: id, accountId: input.accountId};
		}
	};
}
