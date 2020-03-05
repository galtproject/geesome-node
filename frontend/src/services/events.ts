/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import Vue from 'vue';

export const EventBus = new Vue();

export const UPDATE_MEMBER_GROUPS = 'update-member-groups';
export const UPDATE_ADMIN_GROUPS = 'update-admin-groups';
export const UPDATE_GROUP = 'update-group';
export const UPDATE_CURRENT_USER = 'update-current-user';

export function GetEventName(eventName, componentName) {
  return eventName + (componentName == 'main' ? '' : '-' + componentName);
}
