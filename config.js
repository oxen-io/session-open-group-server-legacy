const fs        = require('fs');
const ini       = require('loki-launcher/ini');

let disk_config = {};

let cache, storage;

// phase 1

const updateFromDisk = () => {
  console.log('updateFromDisk - start');
  if (!fs.existsSync('loki.ini')) {
    return false;
  }
  const ini_bytes = fs.readFileSync('loki.ini');
  disk_config = ini.iniToJSON(ini_bytes.toString());
  if (process.env.api__url) {
    // console.log('setting api.api_url to', process.env.api__url, 'from environment');
    disk_config.api.api_url = process.env.api__url;
  }
  if (process.env.admin__url) {
    // console.log('setting api.admin_url to', process.env.api__url, 'from environment');
    disk_config.api.admin_url = process.env.admin__url;
  }
  console.log('updateFromDisk - done');
  return true;
}
// make sure we have some config loaded
// to configure cache
updateFromDisk();

// phase 2

const setup = (configObject) => {
  // start setting things up
  ({ cache, storage } = configObject);

  // now that we have cache
  updateUserAccess();

  // keep disk_config fresh-ish
  setInterval(updateUserAccess, 15 * 60 * 1000); // every 15 mins
}

let user_access = {};

const updateUserAccess = () => {
  if (!updateFromDisk()) {
    console.log('no config file');
    return;
  }
  console.log('config', disk_config);
  // reset permissions to purge any deletions
  user_access = {};
  // load globals pubkeys from file and set their access level
  for(const pubKey in disk_config.globals) {
    const access = disk_config.globals[pubKey];
    // translate pubKey to id of user
    cache.getUserID(pubKey, (user, err) => {
      //console.log('setting', user.id, 'to', access);
      // only if user has registered
      if (user) {
        user_access[user.id] = access;
      }
    })
  }
  // user_access will always be empty here because async
};

// FIXME: move out
const addTempModerator = async (userid) => {
  console.log('Temporarily upgrading', userid, 'to global moderator');
  await storage.addServerModerator(userid);
}

const getConfigGlobals = async() => {
  const globals = [];
  for(var uid in user_access) {
    var access = user_access[uid]
    if (access === true) {
      globals.push(uid);
    }
  }
  return globals;
}

// FIXME: move out
// called by validGlobal
const getUserAccess = async (userid) => {
  const globMod = await storage.isGlobalModerator(userid);
  if (globMod) return true;
  // just get a list a channels I'm a mod for...
  const channels = await storage.getChannelModerator(userid);
  if (channels.length) {
    return channels.join(',');
  }
  // finally check local disk config
  if (user_access[userid]) {
    return user_access[userid];
  }
  return false;
}

module.exports = {
  setup,
  addTempModerator,
  getUserAccess,
  getConfigGlobals,
  getDiskConfig: () => {
    // console.log('disk_config', disk_config);
    return disk_config
  },
};
