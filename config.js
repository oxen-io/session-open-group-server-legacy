const fs        = require('fs');
const ini       = require('loki-launcher/ini');

let disk_config = {};

let cache, storage;

const updateFromDisk = () => {
  if (!fs.existsSync('loki.ini')) {
    return false;
  }
  const ini_bytes = fs.readFileSync('loki.ini');
  disk_config = ini.iniToJSON(ini_bytes.toString());
  if (process.env.api__url) {
    disk_config.api_url = process.env.api__url;
  }
  if (process.env.admin__url) {
    disk_config.admin_url = process.env.admin__url;
  }
  return true;
}
// make sure we have some config loaded
updateFromDisk();

const setup = (configObject) => {
  // start setting things up
  ({ cache, storage } = configObject);

  // keep disk_config fresh-ish
  setInterval(updateFromDisk, 15 * 60 * 1000); // every 15 mins
}

// FIXME: move out
const addTempModerator = async (userid) => {
  console.log('Temporarily upgrading', userid, 'to global moderator');
  await storage.addServerModerator(userid);
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
  return false;
}

module.exports = {
  setup,
  addTempModerator,
  getUserAccess,
  getDiskConfig: () => { return disk_config },
};
