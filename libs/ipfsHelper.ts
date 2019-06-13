const CID = require('cids');
const _ = require('lodash');

module.exports = {
    isIpfsHash(value) {
        if(!value) {
            return false;
        }
        return _.startsWith(value, 'Qm');
    },
    isIpldHash(value) {
        if(!value) {
            return false;
        }
        return _.startsWith(value.codec, 'dag-') || (_.isString(value) && (_.startsWith(value, 'zd') || _.startsWith(value, 'ba')));
    },
    isCid(value) {
        return CID.isCID(value);
    },
    cidToHash(cid) {
        const cidsResult = new CID(1, 'dag-cbor', cid.multihash || Buffer.from(cid.hash.data));
        return cidsResult.toBaseEncodedString();
    }
};
