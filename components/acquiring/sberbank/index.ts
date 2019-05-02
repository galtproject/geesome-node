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

import {IAcquiring, OrderStatus} from "../interface";

const config = require('./config');
const _ = require('lodash');
const axios = require('axios');

module.exports = async () => {
    return new SberbankAcquiring();
};

class SberbankAcquiring implements IAcquiring {
    constructor() {
        
    }
    
    getName() {
        return 'sberbank';
    }

    async createOrder(amount: number, localId, returnUrl: string, additionalOptions?) {
        amount = Math.round(amount * 100);
        
        if(!additionalOptions) {
            additionalOptions = {};
        }
        let orderParams = '';
        if(additionalOptions.isMobile) {
            orderParams += '&pageView=MOBILE';
        } else {
            orderParams += '&pageView=DESKTOP';
        }
        if(additionalOptions.description) {
            orderParams += '&description=' + encodeURIComponent(additionalOptions.description);
        }
        const requestUrl = `https://3dsec.sberbank.ru/payment/rest/register.do?`
            + `amount=${amount}&returnUrl=${encodeURIComponent(returnUrl)}&userName=${config.apiLogin}&password=${config.apiPassword}&`
            + `language=ru&orderNumber=${localId}${orderParams}`;
        //&jsonParams={"orderNumber":1234567890}&expirationDate=2014-09-08T14:14:14

        let {data: responseData} = await axios.get(requestUrl);

        console.log('requestUrl', requestUrl);
        console.log('responseData', responseData);
        if(!responseData.orderId) {
            return responseData;
        }

        return {
            orderId: responseData.orderId,
            //"https://3dsec.sberbank.ru/payment/merchants/sbersafe/payment_ru.html?mdOrder=775659fd-ddc1-7fa4-83ed-7da95e18ac5c"
            paymentUrl: responseData.formUrl
        };
    }
    
    async getOrderStatus(orderId) {
        const requestUrl = `https://3dsec.sberbank.ru/payment/rest/getOrderStatus.do?`
            + `userName=${config.apiLogin}&password=${config.apiPassword}&language=ru&orderId=${orderId}`;
        let {data: responseData} = await axios.get(requestUrl);

        const statuses = {
            '0': OrderStatus.NEW,
            '1': OrderStatus.HOLD,
            '2': OrderStatus.PAID,
            '3': OrderStatus.CANCELLED,
            '4': OrderStatus.RETURNED,
            '5': OrderStatus.AUTHORIZATION,
            '6': OrderStatus.DECLINED
        };
        
        return {
            status: statuses[responseData.OrderStatus],
            error: parseInt(responseData.ErrorCode) === 0 ? null : responseData.ErrorMessage
        };
    }
}
