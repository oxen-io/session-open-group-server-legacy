const fs        = require('fs');
const ini       = require('loki-launcher/ini');

//let user_access = {}; // this should not live here
let disk_config = {};

let cache, storage;

const updateFromDisk = () => {
  if (!fs.existsSync('loki.ini')) {
    return false;
  }
  const ini_bytes = fs.readFileSync('loki.ini');
  disk_config = ini.iniToJSON(ini_bytes.toString());
  return true;
}
// make sure we have some config loaded
updateFromDisk();

const setup = (configObject) => {
  ({ cache, storage } = configObject);
  // start setting things up
  //updateUserAccess();
  // update every 15 mins
  //setInterval(updateUserAccess, 15 * 60 * 1000);
}

/*
const updateUserAccess = () => {
  if (!updateFromDisk()) {
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
*/

// move out
const addTempModerator = async (userid) => {
  console.log('Temporarily upgrading', userid, 'to global moderator');
  await storage.addServerModerator(userid);
}

// move out
// called by validGlobal
const getUserAccess = async (userid) => {
  const globMod = await storage.isGlobalModerator(userid);
  if (globMod) return true;
  // just get a list a channels I'm a mod for...
  const channels = await storage.getChannelModerator(userid);
  if (channels.length) {
    return channels.join(',');
  }
  return false;
}

module.exports = {
  setup,
  addTempModerator,
  getUserAccess,
  getDiskConfig: () => { return disk_config },
};
