import {pathToFileURL} from 'node:url';
import {Sequelize} from 'sequelize';
import databaseConfig from '../app/modules/database/config.js';

const moduleModelSyncers = [
  {
    name: 'accountStorage',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/accountStorage/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'staticId',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/staticId/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'asyncOperation',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/asyncOperation/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'group',
    sync: async (sequelize: Sequelize, models: any) => {
      return (await import('../app/modules/group/models/index.js')).default(sequelize, models);
    },
  },
  {
    name: 'invite',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/invite/models.js')).default(sequelize, models));
      return models;
    },
  },
  {
    name: 'groupCategory',
    sync: async (sequelize: Sequelize, models: any) => {
      return (await import('../app/modules/groupCategory/models/index.js')).default(sequelize, models);
    },
  },
  {
    name: 'staticSiteGenerator',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/staticSiteGenerator/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'socNetImport',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/socNetImport/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'autoActions',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/autoActions/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'pin',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/pin/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'activityPub',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/activityPub/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'foreignAccounts',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/foreignAccounts/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'socNetAccount',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/socNetAccount/models.js')).default(sequelize));
      return models;
    },
  },
  {
    name: 'fileCatalog',
    sync: async (sequelize: Sequelize, models: any) => {
      return (await import('../app/modules/fileCatalog/models.js')).default(sequelize, models);
    },
  },
  {
    name: 'tgContentBot',
    sync: async (sequelize: Sequelize, models: any) => {
      Object.assign(models, await (await import('../app/modules/tgContentBot/models.js')).default(sequelize));
      return models;
    },
  },
];

export async function syncDatabaseModels(): Promise<string[]> {
  const sequelize = new Sequelize({
    ...(databaseConfig as any),
    logging: false,
  });
  const syncedModules = ['database'];

  try {
    await sequelize.authenticate();
    let models: any = await (await import('../app/modules/database/models/index.js')).default(sequelize);

    for (const syncer of moduleModelSyncers) {
      models = await syncer.sync(sequelize, models);
      syncedModules.push(syncer.name);
    }

    return syncedModules;
  } finally {
    await sequelize.close();
  }
}

async function main(): Promise<void> {
  const syncedModules = await syncDatabaseModels();
  console.log(`Synced Sequelize models for ${syncedModules.length} module(s): ${syncedModules.join(', ')}`);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;

if (import.meta.url === entryPoint) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
