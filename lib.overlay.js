// even though we want to conform to the dialect API
// we need to amend data_access and dispatcher with our own models and api
//
// best we have a single entry point for all our common dialect to reduce set up in them

const storage = require('./storage');
const config  = require('./config');
const logic   = require('./logic');
const dialect = require('./lib.dialect');

// Look for a config file
const disk_config = config.getDiskConfig();
storage.start(disk_config);

preflight = false

const setup = (cache, dispatcher) => {
  config.setup({ cache, storage });
  logic.setup({ storage, cache, config });
  dialect.setup({ dispatcher });

  // I guess we're do preflight checks here...
  const dataAccess = cache;

  // preflight checks
  const addChannelNote = (channelId) => {
    var defaultObj = {"name":"Your Public Chat","description":"Your public chat room","avatar":"images/group_default.png"};
    dataAccess.addAnnotation('channel', channelId, 'net.patter-app.settings', defaultObj, function(rec, err, meta) {
      if (err) console.error('err', err);
      console.log('rec', rec, 'meta', meta);
    });
  }
  if (!preflight) {
    preflight = true
    dataAccess.getChannel(1, {}, (chnl, err, meta) => {
      if (err) console.error('channel 1 get err', err);
      if (chnl && chnl.id) {
        return;
      }
      console.log('need to create channel 1!');
      // FIXME: user token_helpers's findOrCreateUser?
      dataAccess.getUser(1, async (user, err2, meta2) => {
        if (err2) console.error('get user 1 err', err2);
        // if no user, create the user...
        console.log('user', user);
        if (!user || !user.length) {
          console.log('need to create user 1!');
          user = await new Promise((resolve, rej) => {
            dataAccess.addUser('root', '', function(user, err4, meta4) {
              if (err4) console.error('add user 1 err', err4);
              resolve(user);
            });
          });
          console.log('user', user.id, 'created!');
        }
        // no channel, so we need to create this public channel
        dataAccess.addChannel(1, {
          type: 'network.loki.messenger.chat.public',
          reader: 0,
          writer: 1,
          readedit: 1,
          writeedit: 1,
          editedit: 1,
          readers: [],
          writers: [],
          editors: [],
        }, (chnl, err3, meta3) => {
          if (err3) console.error('addChannel err', err3);
          if (chnl && chnl.id) {
            console.log('channel', chnl.id, 'created');
          }
          addChannelNote(chnl.id);
        });
      });
    });
    // the race was causing this to create a duplicate annotation
    /*
    dataAccess.getAnnotations('channel', 1, (notes, err, meta) => {
      if (err) console.error('getAnnotations channel err', err);
      //console.log('notes', notes);
      if (!notes || !notes.length) {
        console.log('adding note')
        addChannelNote(1);
      }
    });
    */
  }

  return { storage, logic, config, dialect, cache };
}

module.exports = {
  setup
};
