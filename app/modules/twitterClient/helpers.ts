import {IMessagesState, ITimelineMessagesState} from "./interface";

export {};

const orderBy = require('lodash/orderBy');
const startsWith = require('lodash/startsWith');
const maxBy = require('lodash/maxBy');
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
	getTweetsParams(max_results, pagination_token = undefined) {
		const result = {
			max_results,
			pagination_token,
			// sort_order: 'recency',
			"expansions": ['attachments.media_keys', 'referenced_tweets.id.author_id', 'referenced_tweets.id', 'author_id', 'in_reply_to_user_id'],
			"media.fields": ['url', 'alt_text', 'type', 'preview_image_url', 'duration_ms', 'variants'],
			// "place.fields": ['contained_within', 'country', 'country_code', 'full_name', 'geo', 'id', 'name', 'place_type'],
			// "poll.fields": ['duration_minutes', 'end_datetime', 'id', 'options', 'voting_status'],
			"user.fields": ['profile_image_url'],
			"tweet.fields": ['attachments', 'author_id', 'context_annotations', 'conversation_id', 'created_at', 'entities', 'geo', 'id', 'in_reply_to_user_id', 'lang', 'possibly_sensitive', 'referenced_tweets', 'reply_settings', 'source', 'text', 'withheld']
		} as any;
		if (!max_results) {
			delete result.max_results;
		}
		console.log('getTweetsParams', result);
		return result;
	},
	async handleTwitterLimits(response, limitItems) {
		const {limit, remaining, reset} = response['_rateLimit'];
		if (!remaining) {
			const currentTimestamp = Math.round(new Date().getTime() / 1000);
			if (currentTimestamp < reset) {
				await new Promise((resolve) => setTimeout(resolve, reset - currentTimestamp));
			}
			return FETCH_LIMIT;
		} else {
			return remaining > limitItems ? limitItems : remaining;
		}
	},
	parseTweetsData(response, messagesState: IMessagesState = {} as any): ITimelineMessagesState {
		const {data: list, meta, includes} = (response['_realData'] || response);
		const result = helpers.parseTweetsList(list, includes, messagesState);
		result['nextToken'] = (meta || {}).next_token;
		return result as any;
	},
	parseTweetsList(list, includes, messagesState: IMessagesState = {} as any) {
		const tweetIdsToFetch = [];
		['mediasByKey', 'tweetsById', 'authorById'].forEach(name => {
			messagesState[name] = messagesState[name] || {};
		});
		const {mediasByKey, tweetsById, authorById} = messagesState;
		includes.users.forEach(item => {
			authorById[item.id] = item;
		});
		if (includes.media) {
			includes.media.forEach(item => {
				mediasByKey[item.media_key] = item;
			});
		}
		if (includes.tweets) {
			includes.tweets.forEach(item => {
				setRelations(item);
				tweetsById[item.id] = item;
			});
		}
		if (!messagesState.listIds) {
			messagesState.listIds = [];
		}
		list.forEach(item => {
			setRelations(item);
			tweetsById[item.id] = item;
			messagesState.listIds.push(item.id);
			console.log('parseTweetsList item', JSON.stringify(item));
			const match = (/^(RT \@\w+)/.exec(item.text) || [])[0];
			console.log('match', match);
			if (!match || !match.length) {
				return;
			}
			const retweetId = helpers.getRetweetId(item);
			console.log('retweetId', retweetId, 'tweetsById[retweetId]', tweetsById[retweetId]);
			if (retweetId && tweetsById[retweetId]) {
				item.repost_of_user_id = tweetsById[retweetId].author_id;
			} else {
				const username = match.split(' @')[1];
				const repostMention = item.entities.mentions.filter(m => m.username === username)[0];
				if (repostMention) {
					item.repost_of_user_id = repostMention.id;
				}
			}
			if (startsWith(item.text, 'RT ')) {
				item.text = '';
			}
		})

		function setRelations(item) {
			const mediaSet = item.medias && item.medias.filter(m => m).length;
			if (item.author && (!item.medias.length || mediaSet)) {
				return;
			}
			item.medias = [];
			if (item.attachments && item.attachments.media_keys) {
				for (let i = 0; i < item.attachments.media_keys.length; i++) {
					const mediaKey = item.attachments.media_keys[i];
					if (!mediasByKey[mediaKey]) {
						tweetIdsToFetch.push(item.id);
						break;
					}
					if (mediasByKey[mediaKey].variants) {
						const {url} = (maxBy(mediasByKey[mediaKey].variants, (v) => v.bit_rate) || {}) as any;
						mediasByKey[mediaKey].url = url;
					}
					item.medias.push(mediasByKey[mediaKey]);
				}
			}
			item.users = item.entities && item.entities.mentions ? item.entities.mentions.map(mention => authorById[mention.id]) : [];
			item.author = authorById[item.author_id];
			item.date = new Date(item.created_at).getTime() / 1000;
		}
		messagesState['tweetIdsToFetch'] = tweetIdsToFetch;
		return messagesState;
	},
	makeRepliesList(m, messagesById, tweetsToFetch = [], messagesState: IMessagesState = {} as any) {
		if (!m.referenced_tweets) {
			return;
		}
		m.referenced_tweets.forEach(rt => {
			const rtMessage = messagesById[rt.id];
			if (rtMessage && rtMessage.inList) {
				return;
			}
			if (rtMessage) {
				messagesState.listIds.push(rt.id);
				rtMessage.inList = true;
				helpers.makeRepliesList(rtMessage, messagesById, tweetsToFetch, messagesState);
			}
			if (!rtMessage || (rtMessage.attachments && rtMessage.attachments.media_keys)) {
				tweetsToFetch.push(rt.id);
			}
		});
		messagesById[m.id] = {inList: true}
	},
	getReplyToId(m) {
		return m.referenced_tweets ? (m.referenced_tweets.filter(rt => rt.type === 'replied_to')[0] || {id: null}).id : null;
	},
	getRetweetId(m) {
		return m.referenced_tweets ? (m.referenced_tweets.filter(rt => rt.type === 'retweeted')[0] || {id: null}).id : null;
	}
};

module.exports = helpers;