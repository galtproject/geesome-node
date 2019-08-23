const EventEmitter = require('events');

export class GeesomeEmitter extends EventEmitter {
  NewRemoteGroup = 'NewRemoteGroup';
  NewRemoteUser = 'NewRemoteUser';
  NewPersonalGroup = 'NewPersonalGroup';
}

module.exports = (geesomeApp) => {

  return new GeesomeEmitter();
};
