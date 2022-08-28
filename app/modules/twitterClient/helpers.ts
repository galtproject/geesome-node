export {};

const orderBy = require('lodash/orderBy');
const startsWith = require('lodash/startsWith');
const FETCH_LIMIT = 100;

const helpers = {
	FETCH_LIMIT,
	clearMessageFromMediaMessages(message) {
		let {text, entities} = message;
		const splitText = [];
		let lastIndex = 0;
		orderBy(entities['urls'] || [], ['start'], ['asc']).forEach(entity => {
			splitText.push({content: text.slice(lastIndex, entity.start)});
			lastIndex = entity.end;
			splitText.push({content: text.slice(entity.start, lastIndex), entity});
		});
		splitText.push({content: text.slice(lastIndex, text.length)});

		text = '';
		splitText.forEach(({content, entity}, i) => {
			if (entity && (entity.media_key || entity.mentions)) {
				return;
			}
			if (splitText[i + 1] && splitText[i + 1].entity && splitText[i + 1].entity.media_key) {
				content = content.slice(0, -1);
			}
			text += content;
		});

		const [mentionEntity] = (entities['mentions'] || []).filter(item => !item.start);
		if (mentionEntity && message.in_reply_to_user_id && mentionEntity.id === message.in_reply_to_user_id) {
			text = text.slice(mentionEntity.end + 1);
		}
		return text;
	},
	getTweetsParams(max_results = 20, pagination_token = undefined) {
		return {
			max_results,
			pagination_token,
			"expansions": ['attachments.media_keys', 'referenced_tweets.id.author_id', 'referenced_tweets.id', 'author_id', 'in_reply_to_user_id'],
			"media.fields": ['url', 'alt_text', 'type', 'preview_image_url', 'duration_ms'],
			// "place.fields": ['contained_within', 'country', 'country_code', 'full_name', 'geo', 'id', 'name', 'place_type'],
			// "poll.fields": ['duration_minutes', 'end_datetime', 'id', 'options', 'voting_status'],
			"user.fields": ['profile_image_url'],
			"tweet.fields": ['attachments', 'author_id', 'context_annotations', 'conversation_id', 'created_at', 'entities', 'geo', 'id', 'in_reply_to_user_id', 'lang', 'possibly_sensitive', 'referenced_tweets', 'reply_settings', 'source', 'text', 'withheld']
		} as any;
	},
	async handleTwitterLimits(response) {
		const {limit, remaining, reset} = response['_rateLimit'];
		if (!remaining) {
			const currentTimestamp = Math.round(new Date().getTime() / 1000);
			if (currentTimestamp < reset) {
				await new Promise((resolve) => setTimeout(resolve, reset - currentTimestamp));
			}
			return FETCH_LIMIT;
		} else {
			return remaining;
		}
	},
	parseTweetsData(response, mediasByKey = {}, tweetsById = {}) {
		const {data: list, meta, includes} = response['_realData'];
		const result = helpers.parseTweetsList(list, includes, mediasByKey, tweetsById);
		result['nextToken'] = meta.next_token;
		return result;
	},
	parseTweetsList(list, includes, mediasByKey = {}, tweetsById = {}, usersById = {}) {
		includes.users.forEach(item => {
			usersById[item.id] = item;
		});
		includes.media.forEach(item => {
			mediasByKey[item.media_key] = item;
		});
		includes.tweets.forEach(item => {
			setRelations(item);
			tweetsById[item.id] = item;
		});
		list.forEach(item => {
			setRelations(item);
			if (startsWith(item.text, 'RT ') && helpers.getRetweetId(item)) {
				item.text = '';
			}
		})

		function setRelations(item) {
			item.medias = item.attachments && item.attachments.media_keys ? item.attachments.media_keys.map(mediaKey => mediasByKey[mediaKey]) : [];
			item.users = item.entities && item.entities.mentions ? item.entities.mentions.map(mention => usersById[mention.id]) : [];
			item.author = usersById[item.author_id];
			item.date = new Date(item.created_at).getTime() / 1000;
		}
		return {list, mediasByKey, tweetsById, usersById};
	},
	makeRepliesList(m, messagesById, repliesToImport = [], tweetsToFetch = []) {
		if (!m.referenced_tweets) {
			return;
		}
		m.referenced_tweets.forEach(rt => {
			const rtMessage = messagesById[rt.id];
			if (rtMessage && rtMessage.inList) {
				return;
			}
			if (rtMessage) {
				repliesToImport.push(rtMessage);
				rtMessage.inList = true;
				helpers.makeRepliesList(rtMessage, messagesById, repliesToImport, tweetsToFetch);
			}
			if (!rtMessage || (rtMessage.attachments && rtMessage.attachments.media_keys)) {
				tweetsToFetch.push(rt.id);
			}
		});
		messagesById[m.id] = {inList: true}
		return {repliesToImport, tweetsToFetch};
	},
	getReplyToId(m) {
		return m.referenced_tweets ? (m.referenced_tweets.filter(rt => rt.type === 'replied_to')[0] || {id: null}).id : null;
	},
	getRetweetId(m) {
		return m.referenced_tweets ? (m.referenced_tweets.filter(rt => rt.type === 'retweeted')[0] || {id: null}).id : null;
	}
};

module.exports = helpers;