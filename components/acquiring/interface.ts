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

export interface IAcquiring {
  getName(): string;

  createOrder(amount, localId, returnUrl, additionalOptions?): Promise<IAcquiringOrderResponse>;

  getOrderStatus(orderId): Promise<IAcquiringOrderStatusResponse>;
}

export interface IAcquiringOrderResponse {
  orderId: string;
  paymentUrl: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface IAcquiringOrderStatusResponse {
  status: string;
  error: string;
}

export class OrderStatus {
  static NEW = 'new';
  static HOLD = 'hold';
  static PAID = 'paid';
  static CANCELLED = 'cancelled';
  static RETURNED = 'returned';
  static AUTHORIZATION = 'authorization';
  static DECLINED = 'declined';
}
