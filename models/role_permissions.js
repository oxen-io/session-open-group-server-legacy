const userRole = require('./user_roles');

var permissionModel;

function start(options) {
  const { schema } = options
  /** role_permission storage model */
  permissionModel = schema.define('role_permissions', {
    entity_type: { type: String }, // role,user
    entity_id:    { type: Number }, // which entity id
    object:      { type: String }, // server, channel
    object_id:    { type: Number }, // which object id
    allowed:     { type: Number }, // can connect
    moderator:   { type: Number }, // should get moderator tools
    /*
      can_mass_delete: { type: Number },
      can_view_reports: { type: Number },
      can_change_perms: { type: String }, // of entity (add/remove bans)
      can_add_bans: { type: Number },
      can_delete_bans: { type: Number },
      can_manage_channels: { type: Number }, // add/edit/remove channels/categories
    hide: { type: Number }, // hide entity from lists
    can_post_after_mins: { type: Number }, // only for channels
    mentionable: { type: Number },
    */
    // allowAttachments? (how would you enforce this? what just nuke files after they're uploaded?)
    // audit log?
    // canManageRoles: { type: Number },
    // canMute: { type: Number }, // (Enforcement?)
    // canKick: { type: Number },
    // canChangeName (how would you disable this?)
    // emojis/stickers
    // canManageMessages: { type: Number }, // how is this not an editor?
    // canPostLinks? // (Enforcement?)
    // embedLinks? // (Enforcement?)
    // showHistory // (Enforcement?)
    // allowedAnnotations: { type: String }, // maybe a text?
    // canPinMessages: { type: Number }, // editors?
    // canLock: { type: Number }, // editors?
    // maxMessageRate: { type: Number }, // one message per interval in secs
    // canEditMessages: { type: Number },
    ord: { type: Number }, // what index are we sorted on? entities? objects?
  })
}

const compileByObject = async (object, object_id) => {
  const objectPerms = await permissionModel.find({ where: { object, object_id }, order: 'ord' })
  const perms = objectPerms.pop()
  const triboolPerms = [ 'moderator' ];
  // sync operations only
  objectPerms.forEach( (perm_obj) => {
    triboolPerms.forEach( (perm) => {
      // if -1 disable
      if (perm_obj[perm] === -1) perms[perm] = -1;
      // if 1 enable
      else if (perm_obj[perm] === 1) perms[perm] = 1;
    })
  })
  return perms;
};

const getUsers = (cb) => {
  return permissionModel.find({
    where: { entity_type: 'user' },
  }, cb);
};

const getRolesByUserId = (user_id, cb) => {
  console.log('storage::getRolesByUserId - user_id', user_id)
  return permissionModel.find({
    where: { entity_type: 'user', entity_id: user_id }, order: 'ord'
  }, cb);
};

module.exports = {
  start: start,
  addRolePermissions: (role) => {
    const perm = new permissionModel(role);
    perm.save();
  },
  getRolesByChannelId: (channel_id, cb) => {
    return permissionModel.find({
        where: { object: 'channel', objectid: channel_id }
      }, cb);
  },
  getRolesByUserId,
  getUsers,
  getRoles: async (cb) => {
    return await permissionModel.find({
      where: { entity_type: 'role' }
    }, cb);
  },
  // server or channel
  compileByObject,
  getModeratorsByChannelId: async (channel_id, cb) => {
    const servPerms = await compileByObject('server', 0);
    const chnlPerms = await compileByObject('channel', channel_id);
    const userPerms = await getUsers();
    const allUsersPerms = await userRole.getAllUsers();
    console.log('storage::role_permissions - userPerms', userPerms);
    console.log('storage::role_permissions - allUsersPerms', allUsersPerms);
    return []; // no moderators
  },
  addServerModerator: (user_id) => {
    permissionModel.find({ where: { entity_type: 'user', entityid: user_id }, order: 'ord'}, async (err, permissions) => {
      if (err) console.error('storage:::role_permissions::addServerModerator err', err);
      if (!permissions.length) {
        // creating record
        const permission = new permissionModel;
        permission.entity_type = 'user';
        permission.entity_id = user_id;
        permission.object = 'server';
        permission.object_id = 0;
        permission.moderator = 1;
        permission.moderator.ord = 0;
        //console.log('starting mod save');
        await permission.save();
        //console.log('starting mod saved');
        return;
      }
    });
  },
  isGlobalModerator: async user_id => {
    if (user_id === undefined) {
      console.error('role_permissions:isGlobalModerator given a user_id that is undefined');
      return;
    }
    const userPerms = await getRolesByUserId(user_id);
    //console.log('isBlacklisted userPerms', userPerms);
    if (!userPerms || !userPerms.length) {
      // no entries at all
      // FIXME: look up server default
      return false;
    }
    const perms = userPerms.pop()
    const triboolPerms = [ 'moderator' ];
    // FIXME: a moderator access on any channel will give you global...
    userPerms.map( perm_obj => {
      triboolPerms.map( perm => {
        // if -1 disable
        if (perm_obj[perm] === -1) perms[perm] = -1;
        // if 1 enable
        else if (perm_obj[perm] === 1) perms[perm] = 1;
      })
    })
    if (perms['moderator'] !== -1 && perms['moderator'] !== 1) {
      // FIXME: look up server default
      // write back to perms['allowed']
    }
    return perms['moderator'] == 1 ? true : false;
  },
  getChannelModerator: async user_id => {
    if (user_id === undefined) {
      console.error('role_permissions:getChannelModerator given a user_id that is undefined');
      return;
    }
    const userPerms = await getRolesByUserId(user_id);
    //console.log('getChannelModerator userPerms', userPerms);
    if (!userPerms || !userPerms.length) {
      // no entries at all
      // FIXME: look up server default
      return false;
    }
    const channels = [];
    userPerms.map( perm_obj => {
      if (perm_obj.moderator > 0) {
        console.log(user_id, 'has moderation on', perm_obj);
        channels.push(perm_obj.object_id)
      }
    })
    return channels;
  },
  blacklistUserFromServer: async user_id => {
    if (user_id === undefined) {
      console.error('role_permissions:blacklistUserFromServer given a user_id that is undefined');
      return;
    }
    console.log('blacklistUserFromServer user_id', user_id)
    const permission = new permissionModel;
    permission.entity_type = 'user';
    permission.entity_id = user_id;
    permission.object = 'server';
    permission.object_id = 0;
    permission.allowed = -1;
    permission.moderator = -1;
    permission.moderator.ord = 0;
    await permission.save();
    return true;
  },
  isBlacklisted: async user_id => {
    if (user_id === undefined) {
      console.error('role_permissions:isBlacklisted given a user_id that is undefined');
      return;
    }
    const userPerms = await getRolesByUserId(user_id);
    //console.log('isBlacklisted userPerms', userPerms);
    if (!userPerms || !userPerms.length) {
      // no entries at all
      // FIXME: look up server default
      return false;
    }
    const perms = userPerms.pop()
    const triboolPerms = [ 'allowed' ];
    userPerms.map( perm_obj => {
      triboolPerms.map( perm => {
        // if -1 disable
        if (perm_obj[perm] === -1) perms[perm] = -1;
        // if 1 enable
        else if (perm_obj[perm] === 1) perms[perm] = 1;
      })
    })
    if (perms['allowed'] !== -1 && perms['allowed'] !== 1) {
      // FIXME: look up server default
      // write back to perms['allowed']
    }
    return perms['allowed'] == -1 ? true : false;
  },
}
