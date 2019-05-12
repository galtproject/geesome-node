module.exports.isNumber = (str) => {
    const _ = require('lodash');
    
    if(_.isString(str) && !/^[0-9.]+$/.test(str)) {
        return false;
    }
    return !_.isNaN(parseFloat(str));
};
