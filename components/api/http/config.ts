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

module.exports = {
    endpointsInfo: [
        {uri: '/v1/create-order', body: '{accountAddress,tokensAmount}', response: '{id,acquiringName,acquiringOrderId,acquiringPaymentUrl,chainAccountAddress,chainName,tokensAddress,acquiringStatus,tokensAmount,fiatAmount,createdAt,updatedAt}', header: 'None'},
        {uri: '/v1/check-order/{orderId}', body: 'None', response: '{changed, oldStatus, newStatus, order}', header: 'None'},
        {uri: '/v1/orders', body: 'None', response: '[{}]', header: 'None'},
        {uri: '/v1/orders/{orderId}', body: 'None', response: '{}', header: 'None'}
    ]
};
