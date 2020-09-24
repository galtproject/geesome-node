/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

export interface IChainService {
  isValidAddress(address): boolean;

  getCurrentBlock(): Promise<number>;

  getChainId(): Promise<number>;

  onReconnect(callback): void;

  getTotalSupply(): Promise<any>;

  getTokensBalance(address, tokenAddress?): Promise<any>;

  getTokenSymbol(tokenAddress): Promise<string>;

  getTransactionStatus(txHash): Promise<string>;

  sendTokens(fromPrivateKey, fromAddress, tokenAddress, tokensAmount, accountAddress): Promise<string>;

  getTokensTransfersSumOfAddress(address, fromBlock?): Promise<number>;

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
