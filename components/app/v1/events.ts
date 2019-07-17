const EventEmitter = require('events');

export class GeesomeEmitter extends EventEmitter {
  NewRemoteGroup = 'NewRemoteGroup';
}

module.exports = (geesomeApp) => {

  return new GeesomeEmitter();
};
