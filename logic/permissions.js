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

    // take an id return a user object
    const getUserByUsernamePromise = pubKey => {
      return new Promise((resolve, rej) => {
        cache.getUserID(pubKey, (err, user) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getUserID err', err);
          resolve(user);
        });
      });
    }

    // handle whitelist mode
    if (disk_config.whitelist) {
      // in whitelist mode
      if (disk_config.whitelist[pubKey]) {
        return true;
      }
      // check whitelist db
      const user = await getUserByUsernamePromise(pubKey);
      if (user !== null) {
        if (await storage.isWhitelisted(user.id)) {
          return true;
        }
      }
      // by default everyone is not allowed
      console.warn('logic:::permissions:::passesWhitelist - pubKey', pubKey, 'not whitelisted');
      return false;
    }
    // in blacklist mode

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
  passesWhitelistByUserID: async (userid) => {
    const disk_config = config.getDiskConfig();
    if (disk_config.whitelist) {
      if (config.whitelistAllow(userid)) {
        // if there's a whitelist, you're not on it
        return true;
      }
      // check db
      if (await storage.isWhitelisted(userid)) {
        return true;
      }
      // by default everyone is not allowed
      return false;
    }

    // blacklist mode
    if (await storage.isBlacklisted(userid)) {
      return false;
    }
    // by default everyone is allowed
    return true;
  },
  // FIXME: should return a promise
  getPermissionsByUser: (pubKey, entity, entityId) => {
    // get userID
    cache.getUserID(pubKey, (err, user) => {
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
    let mods = await storage.getModeratorsByChannelId(channelId);
    const configMods = await config.getConfigGlobals();
    mods = [...mods, ...configMods];
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
        cache.getUser(userid, (err, user) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getUserID err', err);
          resolve(user);
        });
      });
    }

    const removeAllTokens = username => {
      return new Promise( async (resolve, rej) => {
        cache.getAPITokenByUsername(username, (err, usertoken, meta) => {
          if (err) console.error('logic:::permissions::blacklistUserFromServer - getAPITokenByUsername err', err);
          if (usertoken) {
            cache.delAPIUserToken(usertoken.token, async (err, delToken) => {
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
      console.warn('logic:::permissions::blacklistUserFromServer - failed to blacklist', result);
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
  unblacklistUserFromServer: async userid => {
    if (userid === undefined) {
      console.error('logic::permission:unblacklistUserFromServer -  given a user_id that is undefined');
      return false;
    }
    const alreadyBlacklisted = await storage.isBlacklisted(userid);
    if (!alreadyBlacklisted) {
      console.warn('logic:::permissions::unblacklistUserFromServer - ', userid, 'is not blacklisted');
      return true;
    }
    // mark the database as such, so they can get new tokens
    const result = await storage.unblacklistUserFromServer(userid);
    if (!result) {
      console.warn('logic:::permissions::unblacklistUserFromServer - failed to blacklist');
      return false;
    }
  },
  whitelistUserForServer: async userid => {
    if (userid === undefined) {
      console.error('logic::permission:whitelistUserForServer -  given a user_id that is undefined');
      return false;
    }
    if (config.whitelistAllow(userid)) {
      // no whitelist or already on it
      console.warn('logic:::permissions::whitelistUserForServer - ', userid, 'already whitelisted');
      return false;
    }
    const alreadyWhitelisted = await storage.isWhitelisted(userid);
    if (alreadyWhitelisted) {
      console.warn('logic:::permissions::whitelistUserForServer - ', userid, 'already whitelisted');
      return true;
    }
    // mark the database as such, so they can't get any new tokens
    const result = await storage.whitelistUserForServer(userid);
    if (!result) {
      console.warn('logic:::permissions::whitelistUserFromServer - failed to whitelist', result);
      return false;
    }
    return true
  },
  unwhitelistUserFromServer: async userid => {
    if (userid === undefined) {
      console.error('logic::permission:unwhitelistUserFromServer -  given a user_id that is undefined');
      return false;
    }
    const alreadyWhitelisted = await storage.isWhitelisted(userid);
    if (!alreadyWhitelisted) {
      console.warn('logic:::permissions::unwhitelistUserFromServer - ', userid, 'is not whitelisted');
      return true;
    }
    // mark the database as such, so they can get new tokens
    const result = await storage.unwhitelistUserFromServer(userid);
    if (!result) {
      console.warn('logic:::permissions::unwhitelistUserFromServer - failed to whitelist');
      return false;
    }
  }
}
