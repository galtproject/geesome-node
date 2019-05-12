const CID = require('cids');
const _ = require('lodash');

module.exports = {
    isIpldHash(value) {
        if(!value) {
            return false;
        }
        return value.multihash || (_.isString(value) && _.startsWith(value, 'zd'));
    },
    cidToHash(cid) {
        const cidsResult = new CID(1, 'dag-cbor', cid.multihash);
        return cidsResult.toBaseEncodedString();
    }
};
