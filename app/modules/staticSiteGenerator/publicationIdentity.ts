import {createHash} from 'node:crypto';
import ipfsHelper from 'geesome-libs/src/ipfsHelper.js';
export const normalizePublicationCid = value => typeof value === 'string' ? ipfsHelper.ipfsHashToCid(value).toString() : ipfsHelper.cidToIpfsHash(value);
export const hashPublicationInput = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
