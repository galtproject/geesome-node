export {};

const orderBy = require('lodash/orderBy');

module.exports = {
	clearMessageFromMediaMessages(message, entities = []) {
		const splitText = [];
		let lastIndex = 0;
		console.log('entities', entities);
		orderBy(entities, ['start'], ['asc']).forEach(entity => {
			splitText.push({content: message.slice(lastIndex, entity.start)});
			lastIndex = entity.end;
			splitText.push({content: message.slice(entity.start, lastIndex), entity});
		});
		splitText.push({content: message.slice(lastIndex, message.length)});

		message = '';
		splitText.forEach(({content, entity}, i) => {
			if (entity && entity.media_key) {
				return;
			}
			if (splitText[i + 1] && splitText[i + 1].entity && splitText[i + 1].entity.media_key) {
				content = content.slice(0, -1);
			}
			message += content;
		});
		return message;
	},
};