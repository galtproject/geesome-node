const orderBy = require('lodash/orderBy');

module.exports = {
	messageWithEntitiesToHtml(message, entities) {
		const splitText = [];
		let lastIndex = 0;
		orderBy(entities, ['offset'], ['asc']).forEach(entity => {
			splitText.push({ content: message.slice(lastIndex, entity.offset) });
			lastIndex = entity.offset + entity.length;
			splitText.push({ content: message.slice(entity.offset, lastIndex), entity });
		});
		splitText.push({ content: message.slice(lastIndex, message.length) });

		message = '';
		splitText.forEach(({content, entity}) => {
			if (entity && entity.className.endsWith('Url')) {
				message += `<a href="${entity.url || content}">${content}</a>`;
			} else if (entity && entity.className === 'MessageEntitySpoiler') {
				message += `<span class="spoiler">${content}</span>`;
			} else if (entity && entity.className === 'MessageEntityStrike') {
				message += `<s>${content}</s>`;
			} else if (entity && entity.className === 'MessageEntityBold') {
				message += `<b>${content}</b>`;
			} else if (entity && entity.className === 'MessageEntityItalic') {
				message += `<i>${content}</i>`;
			} else if (entity && entity.className === 'MessageEntityItalic') {
				message += `<u>${content}</u>`;
			} else if (entity && entity.className === 'MessageEntityCode') {
				message += `<code>${content}</code>`;
			} else {
				message += content;
			}
		});
		return message.replace(/\n/g, '<br>');
	}
}