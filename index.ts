/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

declare global {
  module 'protons-runtime' {
    export const MaxLengthError: any;
  }
}

import {IGeesomeApp} from "./app/interface";
(async () => {
  const databaseConfig: any = {};
  if (process.env.DATABASE_NAME) {
    databaseConfig.name = process.env.DATABASE_NAME;
  }

  const storageConfig: any = {};
  if (process.env.STORAGE_REPO) {
    storageConfig.repo = process.env.STORAGE_REPO;
  }

  const app: IGeesomeApp = await (await import('./app')).default({
    databaseConfig,
    storageConfig: {jsNode: storageConfig, goNode: storageConfig}
  });

  await (await import('./publish-docs')).default(app);
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
  // process.exit(1) //mandatory (as per the Node docs)
});