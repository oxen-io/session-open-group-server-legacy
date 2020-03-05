const fs  = require('fs');
const ini = require('loki-launcher/ini');

let disk_config = {};

let cache, storage;

// phase 1

const updateFromDisk = () => {
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
  if (disk_config.api && disk_config.api.public_url) {
    // strip any trailing slashes
    if (disk_config.api.public_url.match(/\/$/)) {
      console.log('Your loki.ini api.public_url has a trailing slash! Do not do that!');
      disk_config.api.public_url = disk_config.api.public_url.replace(/\/$/, '');
    }
  }
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
let whitelist_access = {};

const updateUserAccess = () => {
  if (!updateFromDisk()) {
    console.log('overlay:::config.js - no loki.ini config file');
    return;
  }
  const visualConfig = {...disk_config};
  // don't put password in logs...
  if (visualConfig.database) delete visualConfig.database.password;
  console.log('config', visualConfig);
  // reset permissions to purge any deletions
  user_access = {};
  // load globals pubkeys from file and set their access level
  // if not array...
  if (!disk_config.globals) {
    console.log('overlay:::config.js - no globals defined in loki.ini')
  }
  for(const pubKey in disk_config.globals) {
    const access = disk_config.globals[pubKey];
    // translate pubKey to id of user
    cache.getUserID(pubKey, (user, err) => {
      // only if user has registered
      if (user) {
        user_access[user.id] = access;
      } else {
        console.log('global', pubKey, 'has not registered yet');
      }
    })
  }

  // optimal as long as requests outnumber number of entries...
  if (disk_config.whitelist) {
    whitelist_access = {};
    for(const pubKey in disk_config.whitelist) {
      // translate pubKey to id of user
      cache.getUserID(pubKey, (user, err) => {
        if (user) {
          whitelist_access[user.id] = true;
        } else {
          console.log('whitelist entry', pubKey, 'has not registered yet');
        }
      });
    }
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

// accessors:
const whitelistAllow = (userid) => {
  return (!disk_config.whitelist) || whitelist_access[userid];
}

const globalAllow = (userid) => {
  return user_access[userid];
}

module.exports = {
  setup,
  addTempModerator,
  getConfigGlobals,
  whitelistAllow,
  globalAllow,
  updateUserAccess,
  getDiskConfig: () => {
    // console.log('disk_config', disk_config);
    return disk_config
  },
};
