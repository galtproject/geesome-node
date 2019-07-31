/*
 * Copyright ©️ 2018 Galt•Space Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka),
 * [Dima Starodubcev](https://github.com/xhipster),
 * [Valery Litvin](https://github.com/litvintech) by
 * [Basic Agreement](http://cyb.ai/QmSAWEG5u5aSsUyMNYuX2A2Eaz4kEuoYWUkVBRdmu9qmct:ipfs)).
 *
 * Copyright ©️ 2018 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) and
 * Galt•Space Society Construction and Terraforming Company by
 * [Basic Agreement](http://cyb.ai/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS:ipfs)).
 */

export interface IChainService {
  getDefaultTokenAddress(): string;

  getCoinbaseAddress(): string;

  isValidAddress(address): boolean;

  getCurrentBlock(): Promise<number>;

  getChainId(): Promise<number>;

  onReconnect(callback): void;

  getTotalSupply(): Promise<any>;

  getTokensBalance(address, tokenAddress?): Promise<any>;

  getTokenSymbol(tokenAddress): Promise<string>;

  getTransactionStatus(txHash): Promise<string>;

  sendTokens(tokenAddress, tokensAmount, accountAddress): Promise<string>;

  getExplorerTokensBalance(address, tokenAddress?): Promise<any>;

  getTokensTransfersSumOfAddress(address, fromBlock?): Promise<number>;

  getExplorerTransactionTemplate(): string;

  // runAutoClaimer(): void;
}

export interface IChainTransferEvent {
  returnValues: { from: string, to: string, value: number };
}

export class IChainTxStatus {
  static NOT_SENT = 'not_sent';
  static PENDING = 'pending';
  static CONFIRMED = 'confirmed';
  static REVERTED = 'reverted';
}
