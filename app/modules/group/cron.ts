/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import pIteration from 'p-iteration';
import {IGroup} from "./interface.js";

export default (geesomeApp) => {

  //TODO: get from settings
  const updateOutdatedForSeconds = 60;
  const bindStaticForHours = 24;

  // updateStaticIdsOfGroups();
  //
  // cron.schedule('* * * * *', () => {
  //   updateStaticIdsOfGroups();
  // });

  async function updateStaticIdsOfGroups() {
    console.log('updateStaticIdsOfGroups');

    const groupsToUpdateStatic = await geesomeApp.ms.database.getGroupWhereStaticOutdated(updateOutdatedForSeconds);
    await pIteration.forEach(groupsToUpdateStatic, async (group: IGroup) => {
      console.log('bindToStaticId group', group.name, group.manifestStorageId, group.manifestStaticStorageId);
      await geesomeApp.storage.bindToStaticId(group.manifestStorageId, group.manifestStaticStorageId, {lifetime: bindStaticForHours + 'h'});

      await geesomeApp.ms.database.updateGroup(group.id, {
        staticStorageUpdatedAt: new Date()
      });
    });
  }
};
