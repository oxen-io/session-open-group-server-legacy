// have to generalize these since almost every system needs to check permissions

let storage;
let cache;

module.exports = {
  start: (configObject) => {
    ({ storage, cache } = configObject);
  },
  // maybe only needed in dialog_token
  passesWhitelist: async (pubKey) => {
    const disk_config = config.getDiskConfig();
    // if we have a whitelist
    if (disk_config.whitelist && !disk_config.whitelist[pubKey]) {
      // and you're not on it
      return false;
    }

    // take an id return a user object
    const getUserByUsernamePromise = pubKey => {
      return new Promise((resolve, rej) => {
        cache.getUserID(pubKey, (user, err) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getUserID err', err);
          resolve(user);
        });
      });
    }

    const user = await getUserByUsernamePromise(pubKey);
    if (user !== null) {
      const alreadyBlacklisted = await storage.isBlacklisted(user.id);
      if (alreadyBlacklisted) {
        return false;
      }
    }
    // by default everyone is allowed
    return true;
  },
  // FIXME: should return a promise
  getPermissionsByUser: (pubKey, entity, entityId) => {
    // get userID
    cache.getUserID(pubKey, (user, err) => {
      this.getPermissionsByUserId(user.id, entity, entityId)
    })
  },
  getEntityPermissionsByUserId: async (userid, entity, entityId) => {
    if (userid === undefined) {
      console.warn('logic:::permissions::getPermissionsByUserId - no userid');
      return [ 'no userid' ];
    }
    if (entity === undefined) {
      console.warn('logic:::permissions::getPermissionsByUserId - no entity');
      return [ 'no entity' ];
    }
    if (entityId === undefined) {
      console.warn('logic:::permissions::getPermissionsByUserId - no entityId');
      return [ 'no entityId' ];
    }
    // get user roles
    let roles
    try {
      console.log('logic:::permissions::getPermissionsByUserId - ', userid);
      roles = await storage.getRolesByUserId(userid, (err, roles) => {
        console.log('roles', roles);
        // get roles permissions by entity
        // get user permissions by entity
        // collapse it down...
      })
    } catch(e) {
      console.error('getPermissionsByUserId failure', e);
    }
    console.log('roles return', roles)
    return [ false, [] ];
  },
  getAllPermissionsByUserId: async (userid) => {
    //console.log('logic:::permissions::getPermissionsByUserId(', userid, entity, entityId, ')');
    if (userid === undefined) {
      console.warn('logic:::permissions::getPermissionsByUserId - no userid');
      return [ 'no userid' ];
    }
    // get user roles
    let roles
    try {
      console.log('logic:::permissions::getPermissionsByUserId - ', userid);
      roles = await storage.getRolesByUserId(userid);
      console.log('roles', roles);
      // get roles permissions by entity
      // get user permissions by entity
      // collapse it down...
    } catch(e) {
      console.error('getPermissionsByUserId failure', e);
    }
    return [ false, [] ];
  },
  getPermissionsByChannelId: async (channelid, entity, entityId) => {
    // get channel roles
    try {
      const roles = await storage.getRolesByChannelId(channelid, (err, roles) => {
        console.log('channel roles', roles);
        // get roles permissions by entity
        // get user permissions by entity
        // collapse it down...
      })
    } catch(e) {
      console.error('getPermissionsByChannelId failure', e);
    }
    console.log('roles return', roles);
    // we need to return a list of users that fit these permissions?
  },
  whoHasThisPerm: (entity, entityId, permission) => {
    // look for perm value of 1
  },
  getModeratorsByChannelId: async (channelId, cb) => {
    const mods = await storage.getModeratorsByChannelId(channelId);
    return mods;
  },
  addGlobalModerator: async userid => {
    const result = await storage.addServerModerator(userid);
  },
  blacklistUserFromServer: async userid => {
    // have to promisify these to play nicely with other promise stuff
    // actually maybe I didn't need these...

    // take an id return a user object
    const getUserPromise = userid => {
      return new Promise((resolve, rej) => {
        cache.getUser(userid, (user, err) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getUserID err', err);
          resolve(user);
        });
      });
    }

    const removeAllTokens = username => {
      return new Promise( async (resolve, rej) => {
        cache.getAPITokenByUsername(username, (usertoken, err, meta) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getAPITokenByUsername err', err);
          if (usertoken) {
            cache.delAPIUserToken(usertoken.token, async (delToken, err) => {
              if (err) console.error('logic:::permissions::blacklistUserFromServer - delAPIUserToken err', err);
              await removeAllTokens(username);
              resolve();
            });
          } else {
            resolve();
          }
        });
      });
    }

    if (userid === undefined) {
      console.error('logic::permission:blacklistUserFromServer -  given a user_id that is undefined');
      return false;
    }
    const alreadyBlacklisted = await storage.isBlacklisted(userid);
    if (alreadyBlacklisted) {
      console.warn('logic:::permissions::blacklistUserFromServer - ', userid, 'already blacklisted');
      return true;
    }
    // mark the database as such, so they can't get any new tokens
    const result = await storage.blacklistUserFromServer(userid);
    if (!result) {
      console.warn('logic:::permissions::blacklistUserFromServer - failed to blacklist');
      return false;
    }
    // get username, so we can query token by username
    const user = await getUserPromise(userid);
    const username = user.username;

    if (username !== null ) {
      // expire all their tokens they have
      await removeAllTokens(username)
    } else {
      console.error('logic:::permissions::blacklistUserFromServer - null username for', userid)
    }
    return true;
  },
}
