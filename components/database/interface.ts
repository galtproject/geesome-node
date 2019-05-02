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

export interface IDatabase {
    flushDatabase(): Promise<void>;

    addOrder(order: IOrder): Promise<IOrder>;
    updateOrder(id, updateData: any): Promise<void>;
    deleteOrder(id): Promise<void>;
    getOrders(accountAddress, limit?, offset?): Promise<IOrder[]>;
    getOrder(id): Promise<IOrder>;

    getValue(key: string): Promise<string>;
    setValue(key: string, content: string): Promise<void>;
    clearValue(key: string): Promise<void>;
}

export interface IOrder {
    id?: number;
    acquiringName: string;
    acquiringOrderId?: string;
    acquiringPaymentUrl?: string;
    chainTxId?: string;
    chainName: string;
    chainAccountAddress: string;
    tokensAddress: string;
    tokensAmount: number;
    fiatAmount: number;
    acquiringStatus?: string;
    acquiringError?: string;
    chainStatus?: string;
    chainError?: string;
}
