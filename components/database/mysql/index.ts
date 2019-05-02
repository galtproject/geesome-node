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

import {IDatabase} from "../interface";

const _ = require("lodash");
const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const config = require('./config');

module.exports = async function(extendConfig?: any) {
    const extendedConfig = _.merge({}, config, extendConfig || {});
    
    let sequelize = new Sequelize(extendedConfig.name, extendedConfig.user, extendedConfig.password, extendedConfig.options);
    
    let models;
    try {
        models = await require('./models/index')(sequelize);
    } catch (e) {
        return console.error('Error', e);
    }
    
    return new MysqlDatabase(sequelize, models, extendedConfig);
};

class MysqlDatabase implements IDatabase {
    sequelize: any;
    models: any;
    config: any;
    
    constructor(_sequelize, _models, _config) {
        this.sequelize = _sequelize;
        this.models = _models;
        this.config = _config;
    }

    async flushDatabase() {
        await this.models.Order.destroy({ where: { } });
        await this.models.Value.destroy({ where: { } });
    }

    async addOrder(order) {
        if(order.chainAccountAddress) {
            order.chainAccountAddress = order.chainAccountAddress.toLowerCase();
        }
        return this.models.Order.create(order);
    }

    async updateOrder(id, updateData) {
        if(updateData.chainAccountAddress) {
            updateData.chainAccountAddress = updateData.chainAccountAddress.toLowerCase();
        }
        return this.models.Order.update(updateData, {where: { id } })
    }

    async deleteOrder(id) {
        return this.models.Order.destroy({where: { id } })
    }

    async getOrders(chainAccountAddress, limit = 10, offset = 0) {
        chainAccountAddress = chainAccountAddress.toLowerCase();
        return this.models.Order.findAll({ 
            where: { chainAccountAddress },
            order: [
                ['createdAt', 'DESC']
            ],
            limit,
            offset
        });
    }

    async getOrder(id) {
        return this.models.Order.findOne({ where: { id } });
    }
    
    async getValue(key: string) {
        const valueObj = await this.models.Value.findOne({ where: { key } });
        return valueObj ? valueObj.content : null;
    }

    async setValue(key: string, content: string) {
        const valueObj = await this.models.Value.findOne({ where: { key } });
        if(valueObj) {
            return valueObj.update({ content }, {where: { key } })
        } else {
            return this.models.Value.create({ key, content });
        }
    }

    async clearValue(key: string) {
        return this.models.Value.destroy({ where: { key } });
    }
}
