module.exports.isNumber = (str) => {
    if(_.isString(str) && !/^[0-9.]+$/.test(str)) {
        return false;
    }
    return !_.isNaN(parseFloat(str));
};
