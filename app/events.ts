/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import EventEmitter from 'events';

export class GeesomeEmitter extends EventEmitter.EventEmitter {
  constructor() {
    super();
  }
  NewRemoteGroup = 'NewRemoteGroup';
  NewRemoteUser = 'NewRemoteUser';
  NewPersonalGroup = 'NewPersonalGroup';
}

export default function (geesomeApp) {

  return new GeesomeEmitter();
};
