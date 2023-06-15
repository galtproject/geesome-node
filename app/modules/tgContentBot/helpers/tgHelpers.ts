import { includes } from 'lodash';

const botAdmins = ['admin1', 'admin2', 'admin3'];
import { Message, TelegramBot } from 'node-telegram-bot-api';

interface SafeExecuteCache {
  [userTgId: string]: boolean;
}

const safeExecuteCache: Record<string, boolean> = {};

interface TgHelpers {
  isFromBotAdmin(msg: Message): boolean;
  isBotAdminTgId(userTgId: number): boolean;
  isBotId(tgId: number): boolean;
  isMemberCanBan(bot: TelegramBot, chatId: number, memberId: number): Promise<boolean>;
  isMemberAdmin(bot: TelegramBot, chatId: number, memberId: number): Promise<boolean>;
  idToString(id: number): string;
  getRefLink(code: string): string;
  safePaymentExecute(msg: Message): {
    promiseReleaseExecute(promise: Promise<any>): Promise<any>;
    releaseExecute(): void;
  };
  processMessage(bot: TelegramBot, msg: Message, initialText: string): Promise<{
    continueMessage(additionalText: string): Promise<any> | undefined;
  }>;
}

const tgHelpers: TgHelpers = {
  isFromBotAdmin(msg: Message) {
    return tgHelpers.isBotAdminTgId(msg.from?.id || 0);
  },
  isBotAdminTgId(userTgId) {
    return includes(botAdmins, parseInt(userTgId.toString()));
  },
  isBotId(tgId) {
    return tgId.toString() === '5572413977';
  },
  async isMemberCanBan(bot, chatId, memberId) {
    const member = await bot.getChatMember(chatId, memberId);
    return member.status === 'creator' || member.can_restrict_members;
  },
  async isMemberAdmin(bot, chatId, memberId) {
    const member = await bot.getChatMember(chatId, memberId);
    return (
      member &&
      member.status &&
      (member.status === 'creator' ||
        member.status === 'administrator' ||
        (member.user && member.user.username === 'GroupAnonymousBot'))
    );
  },
  idToString(id) {
    return id.toString().split('.')[0];
  },
  getRefLink(code) {
    return 't.me/MicroFortBot?start=' + code;
  },
  safePaymentExecute(msg) {
    const userTgId = tgHelpers.idToString(msg.from?.id || 0);
    if (safeExecuteCache[userTgId]) {
      throw new Error('safe_execute:' + userTgId);
    }
    safeExecuteCache[userTgId] = true;
    return {
      promiseReleaseExecute(promise) {
        return promise
          .catch((e) => {
            delete safeExecuteCache[userTgId];
            throw e;
          })
          .then((r) => {
            delete safeExecuteCache[userTgId];
            return r;
          });
      },
      releaseExecute() {
        delete safeExecuteCache[userTgId];
      },
    };
  },
  async processMessage(bot, msg, initialText) {
    const { message_id } = await bot.sendMessage(msg.chat.id, initialText, {
      parse_mode: 'HTML',
    });
    let resultText = initialText;
    return {
      continueMessage(additionalText) {
        if (!additionalText) {
          return;
        }
        resultText += additionalText;
        return bot.editMessageText(resultText, {
          chat_id: msg.chat.id,
          message_id,
          parse_mode: 'HTML',
        });
      },
    };
  },
};

export default tgHelpers;
