import _ from 'lodash';
import TelegramBot from "node-telegram-bot-api";
import commonHelper from "geesome-libs/src/common.js";
import MultiTelegramBot from "./multiTelegramBot.js";
import {IGeesomeApp} from "../../interface.js";
import {IListParamsOptions} from "../database/interface.js";
import helpers from "../../helpers.js";
const {pick} = _;

const contentBotListParams: IListParamsOptions = {
    sortBy: 'createdAt',
    allowedSortBy: ['createdAt', 'updatedAt', 'botUsername', 'socNet', 'id'],
    maxLimit: 100
};

function getContentBotListOrder(sortBy, sortDir) {
    const direction = sortDir.toUpperCase();
    const order = [[sortBy, direction]];
    if (sortBy !== 'id') {
        order.push(['id', direction]);
    }
    return order;
}

export default (app: IGeesomeApp, models: any, multitelegrambot: MultiTelegramBot) => {
    const api = app.ms.api.prefix('content-bot/');

    api.onAuthorizedPost('add', async (req, res) => {
        const botId = req.body.tgToken.split(":")[0];
        const encryptedToken = await app.encryptTextWithAppPass(req.body.tgToken);
        const tokenHash = await commonHelper.hash(req.body.tgToken);
        const bot = new TelegramBot(req.body.tgToken, { polling: false });
        const botInfo = await bot.getMe();
        await models.ContentBots.create({encryptedToken, botId, socNet: req.body.socNet, botUsername: botInfo.username, userId: req.user.id, tokenHash});
        bot.setWebHook(`https://${req.headers.host}/api/v1/content-bot/tg-webhook/${req.body.tgToken}`).then(() => {
            console.log('Webhook successfully set');
        });
        bot.setMyCommands([
            { command: '/start', description: 'Initial greeting' },
            { command: '/savePhoto', description: 'Save photo to ipfs' }
        ]);
        res.send("ok", 200);
    });

    /**
     * @api {post} /v1/content-bot/list List content bots
     * @apiName UserContentBotList
     * @apiGroup ContentBot
     *
     * @apiUse ApiKey
     * @apiUse AuthErrors
     *
     * @apiInterface (../../interface.ts) {IListQueryInput} apiBody
     * @apiSuccess {Object[]} list Content bots.
     */
    api.onAuthorizedPost('list', async (req, res) => {
        const listParams = helpers.prepareListParams(req.body, contentBotListParams);
        app.ms.database.setDefaultListParamsValues(listParams, contentBotListParams);
        const {limit, offset, sortBy, sortDir} = listParams;
        const list = await models.ContentBots.findAll({
            where: {userId: req.user.id},
            order: getContentBotListOrder(sortBy, sortDir),
            limit,
            offset
        });
        res.send(list, 200);
    });

    api.onAuthorizedPost('addUser', async (req, res) => {
        const pickedObject = pick(req.body, ['userTgId', 'contentLimit', 'isAdmin', 'contentBotId']);
        await models.User.create(pickedObject);
        res.send("ok", 200);
    });

    api.onPost("tg-webhook/:tgToken", async (req, res) => {
        const tgToken = req.params.tgToken;
        multitelegrambot.triger(req.body, tgToken, req.headers.host);
        return res.send("ok", 200);
    });

}
