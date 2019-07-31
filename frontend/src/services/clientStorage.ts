export class ClientStorage {
  static get(name) {
    try {
      return JSON.parse(localStorage.getItem(name));
    } catch (e) {
      return null;
    }
  }

  static set(name, value) {
    localStorage.setItem(name, JSON.stringify(value));
  }

  static joinToGroup(groupId) {
    const groupsIds = this.joinedGroups();
    groupsIds.push(groupId);
    this.set('joined-groups', groupsIds);
  }

  static leaveGroup(groupId) {
    const groupsIds = this.joinedGroups();
    const groupIndex = groupsIds.indexOf(groupId);
    if (groupIndex === -1) {
      return;
    }
    groupsIds.splice(groupIndex, 1);
    this.set('joined-groups', groupsIds);
  }

  static isMemberOfGroup(groupId) {
    const groupsIds = this.joinedGroups();
    return groupsIds.indexOf(groupId) !== -1;
  }

  static joinedGroups() {
    return this.get('joined-groups') || [];
  }
}
