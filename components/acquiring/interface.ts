/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
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
