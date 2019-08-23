export {};

let config = require('./config');
const fs = require('fs');

if (!fs.existsSync(`${__dirname}/config/`)) {
  fs.mkdirSync(`${__dirname}/config/`);
}
fs.writeFileSync(`${__dirname}/config/config.json`, JSON.stringify({
  production: {
    database: config.name,
    username: config.user,
    password: config.password,
    host: config.options.host,
    dialect: config.options.dialect
  }
}));
