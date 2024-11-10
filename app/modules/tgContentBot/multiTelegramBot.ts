import TelegramBot from "node-telegram-bot-api";
import commonHelper from "geesome-libs/src/common.js";

export default class MultiTelegramBot {
    constructor(models){
        this.models = models;
    }
    events = [];
    models = {};
    async triger(body, tgToken, host) {
        const botId = tgToken.split(':')[0];
        const tokenHash = commonHelper.hash(tgToken);
        const tgcontentbot = await this.models['ContentBots'].findOne({ where: { botId, tokenHash } });
        if (!tgcontentbot) {
            return;
        }
        this.events.forEach(event => {
            let entity;
            if (body.message && event.text && event.text.test(body.message.text)){
                entity = body.message;
            } else if (body.inline_query && event.type == "inline_query") {
                entity = body.inline_query;
            } else if (body.callback_query && event.type == "callback_query"){
                entity = body.callback_query;
            } else if (body.message && body.message.photo && event.type == "photo") {
                entity = body.message;
            }
            if (!entity){
                return
            }
            entity.host = host;
            entity.userId = tgcontentbot.userId;
            entity.bot = new TelegramBot(tgToken, {polling: false});
            event.callback(entity, entity.text && event.text && event.text.test ? entity.text.match(event.text) : undefined);
        });
    };
    onText(text, callback) {
        this.events.push({text, callback});
    };
    on(type, callback){
        this.events.push({type, callback});
    };
}
