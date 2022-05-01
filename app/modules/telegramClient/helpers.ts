const orderBy = require('lodash/orderBy');
const find = require('lodash/find');
const pick = require('lodash/pick');
const maxBy = require('lodash/maxBy');
const isNumber = require('lodash/isNumber');

module.exports = {
	messageWithEntitiesToHtml(message, entities = []) {
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
			let startBrCount = 0;
			content = content.replace(/^\n+/g, () => {startBrCount+=1; return ""});
			let endBrCount = 0;
			content = content.replace(/\n+$/g, () => {endBrCount+=1; return ""});

			if (entity && entity.className.endsWith('Url')) {
				content = `<a href="${entity.url || content}">${content}</a>`;
			} else if (entity && entity.className === 'MessageEntitySpoiler') {
				content = `<span class="spoiler">${content}</span>`;
			} else if (entity && entity.className === 'MessageEntityStrike') {
				content = `<s>${content}</s>`;
			} else if (entity && entity.className === 'MessageEntityBold') {
				content = `<b>${content}</b>`;
			} else if (entity && entity.className === 'MessageEntityItalic') {
				content = `<i>${content}</i>`;
			} else if (entity && entity.className === 'MessageEntityUnderline') {
				content = `<u>${content}</u>`;
			} else if (entity && entity.className === 'MessageEntityCode') {
				content = `<code>${content}</code>`;
			}

			content = "<br>".repeat(startBrCount) + content + "<br>".repeat(endBrCount);

			message += content;
		});
		return message.replace(/\n/g, '<br>');
	},
	getMediaFileAndSize(media) {
		let file;
		let fileSize: number;
		let mimeType;
		let thumbSize = 'y';
		if (media.photo || (media.webpage && media.webpage.photo)) {
			file = media.photo || media.webpage.photo;
			console.log('file.sizes', file.sizes);
			const ySize = find(file.sizes, s => s.sizes && s.sizes.length) || {sizes: file.sizes};
			if (!ySize || !ySize.sizes) {
				return {};
			}
			if (isNumber(ySize.sizes[0])) {
				fileSize = maxBy(ySize.sizes);
			} else {
				const maxSize = maxBy(ySize.sizes.filter(s => s.size), s => s.size);
				fileSize = maxSize.size
				thumbSize = maxSize.type;
			}
			mimeType = 'image/jpg';
		} else if (media.document) {
			file = media.document;
			fileSize = file.size;
			mimeType = file.mimeType;
		} else {
			// console.log('media', media);
		}
		// console.log('media.webpage', media.webpage);
		return {file, fileSize, mimeType, thumbSize};
	},

	mediaWebpageToLinkStructure(webpage) {
		return JSON.stringify({
			...pick(webpage, ['url', 'displayUrl', 'siteName', 'title', 'description']),
			type: 'url'
		});
	}
}