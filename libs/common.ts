export {};

const _ = require('lodash');

module.exports.isNumber = (str) => {
    const _ = require('lodash');
    
    if(_.isString(str) && !/^[0-9.]+$/.test(str)) {
        return false;
    }
    return !_.isNaN(parseFloat(str));
};
module.exports.moveFromDate = (fromDate, value, unit) => {
  value = parseFloat(value);
  if(_.includes(unit, 'second')) {
    return new Date(fromDate.getTime() + value * 1000);
  }
  if(_.includes(unit, 'minute')) {
    return new Date(fromDate.getTime() + value * 60 * 1000);
  }
  if(_.includes(unit, 'hour')) {
    return new Date(fromDate.getTime() + value * 60 * 60 * 1000);
  }
  if(_.includes(unit, 'day')) {
    return new Date(fromDate.getTime() + value * 24 * 60 * 60 * 1000);
  }
  if(_.includes(unit, 'week')) {
    return new Date(fromDate.getTime() + value * 7 * 24 * 60 * 60 * 1000);
  }
  if(_.includes(unit, 'month')) {
    return new Date(fromDate.getTime() + value * 30 * 24 * 60 * 60 * 1000);
  }
  return null;
};
module.exports.moveDate = (value, unit) => {
  return module.exports.moveFromDate(new Date(), value, unit);
};
