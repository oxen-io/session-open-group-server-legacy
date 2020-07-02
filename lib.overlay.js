// even though we want to conform to the dialect API
// we need to amend data_access and dispatcher with our own models and api
//
// best we have a single entry point for all our common dialect to reduce set up in them

const bb        = require('bytebuffer');
const libsignal = require('libsignal');

const storage = require('./storage');
const config  = require('./lib.config');
const logic   = require('./logic');
const dialect = require('./lib.dialect');
const loki_crypt = require('./lib.loki_crypt');
const platformConfigUtil = require('./server/lib/lib.config');

// used for creating a default token for user 1
const ADN_SCOPES = 'basic stream write_post follow messages update_profile files export';

// Look for a config file
const disk_config = config.getDiskConfig();

preflight = false;

const setup = (cache, dispatcher) => {

  // I guess we're do preflight checks here...
  const dataAccess = cache;

  // preflight checks
  const addChannelNote = (channelId) => {
    var defaultObj = {"name":"Your Public Chat","description":"Your public chat room","avatar":"images/group_default.png"};
    dataAccess.addAnnotation('channel', channelId, 'net.patter-app.settings', defaultObj, function(err, rec, meta) {
      if (err) console.error('err', err);
      if (!rec) {
        console.warn('annotation', JSON.parse(JSON.stringify(rec)), 'meta', meta);
      }
    });
  }

  const addChannelMessage = (privKey, channelId) => {
    return new Promise(resolve => {
      dataAccess.addMessage({
        channel_id: channelId,
        text: 'system generated initial message',
        machine_only: 0,
        thread_id: 0,
        userid: 1,
        reply_to: 0,
        is_deleted: 0,
        created_at: new Date
      }, async (err, msg) =>{
        if (err) console.error('addChannelMessage err', err);
        // console.log('addChannelMessage msg', JSON.parse(JSON.stringify(msg)));
        if (msg.id) {
          var defaultObj = {
            timestamp: parseInt(Date.now() / 1000),
          };
          /*
          const sigData = getSigData(1, defaultObj, {
            text: msg.text
          });
          const sig = await libsignal.curve.calculateSignature(privKey, sigData);
          defaultObj.sigver = 1;
          defaultObj.sig = sig.toString('hex');
          */
          defaultObj.sig = await loki_crypt.getSigData(1, privKey, defaultObj, {
            text: msg.text
          });
          defaultObj.sigver = 1;
          dataAccess.addAnnotation('message', msg.id, 'network.loki.messenger.publicChat', defaultObj, function(err, rec, meta) {
            // , JSON.parse(JSON.stringify(rec))
            console.log('created initial message for mobile');
            resolve(err, msg);
          });
        }
      });
    });
  }

  // only do this once on startup...
  if (!preflight) {
    preflight = true

    config.setup({ cache, storage });
    logic.setup({ storage, cache, config });
    dialect.setup({ dispatcher });
    storage.start(disk_config);

    // only set up a channels, if channels enabled (open group mode)
    if (platformConfigUtil.moduleEnabled('channels')) {
      console.log('Open group mode detected')
      dataAccess.getChannel(1, {}, async (err, chnl, meta) => {
        if (err) console.error('channel 1 get err', err);
        if (chnl && chnl.id) {
          const configWhitelistEnabled = !!disk_config.whitelist;
          // do read permissions match?
          // write shouldn't matter, if you can't get a token/user, you can't write
          const channelWhitelistEnabled = chnl.reader !== 0;
          console.log('configWhitelistEnabled', configWhitelistEnabled);
          console.log('channelWhitelistEnabled', channelWhitelistEnabled);
          if (configWhitelistEnabled != channelWhitelistEnabled) {
            console.log('Need to fix up channel permissions');
            // this will disable public reading of the channel

            // would this work with proxy-admin system?
            // 0 = public, 1 = any user (has token)
            dataAccess.updateChannel(1, { reader: configWhitelistEnabled ? 1 : 0 }, function(err, channel) {
              if (err) console.error('overlay updateChannel err', err);
              else console.log('updated channel permissions', channel);
            });
          }
          if (configWhitelistEnabled) {
            // just make sure our owner is whitelisted for proxy mod actions
            console.log('checking', chnl.ownerid);
            if (chnl.ownerid) {
              const alreadyWhitelisted = await storage.isWhitelisted(chnl.ownerid);
              if (!alreadyWhitelisted) {
                console.log('whitelisting channel owner, userid:', chnl.ownerid);
                logic.whitelistUserForServer(chnl.ownerid);
              }
            }
          }
          return;
        }
        console.log('need to create initial channel');
        // FIXME: user token_helpers's findOrCreateUser?
        dataAccess.getUser(1, async (err2, user, meta2) => {
          if (err2) console.error('get user 1 err', err2);
          // if no user, create the user...
          // user === null when D.N.E.
          // console.log('user', user);
          var privKey, pubKey;
          if (!user || !user.length) {
            console.log('need to create initial user');
            // block until this is complete
            user = await new Promise((resolve, rej) => {
              const ourKey = libsignal.curve.generateKeyPair();
              privKey = ourKey.privKey;
              pubKey = ourKey.pubKey;
              var pubKeyhex = bb.wrap(ourKey.pubKey).toString('hex')
              dataAccess.addUser(pubKeyhex, '', async function(err4, user, meta4) {
                if (err4) console.error('add user 1 err', err4);
                // maybe some annotation to set the profile name...
                // maybe a session icon?
                // console.log('schemaType', storage.schemaType)
                if (storage.schemaType === 'memory') {
                  // lets prompt him to mod too...
                  console.log('Giving temp mod to', user.id)
                  config.addTempModerator(user.id)
                  if (config.inWhiteListMode()) {
                    // add them to the white list...
                    const result = await logic.whitelistUserForServer(user.id);
                    if (!result) {
                      console.warn('could not whitelist!')
                    }
                  }
                  // generate a token for server/tests
                  cache.createOrFindUserToken(user.id, 'messenger', ADN_SCOPES, function(err5, token) {
                    if (err5) console.error('add user 1 token err', err5);
                    console.log('generated token', JSON.parse(JSON.stringify(token)));
                  })
                }
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
          }, (err3, chnl, meta3) => {
            if (err3) console.error('addChannel err', err3);
            if (chnl && chnl.id) {
              console.log('channel', chnl.id, 'created');
              addChannelNote(chnl.id);
              // only can do this if we just created the userid 1
              if (privKey) {
                //console.log('need to create message 1!')
                addChannelMessage(privKey, chnl.id);
              }
            } else {
              console.error('Unable to set up channel')
            }
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
    } else {
      console.log('File server mode detected')
    }
  }

  return { storage, logic, config, dialect, cache };
}

const getUserAccess = async (userid) => {
  const globMod = await storage.isGlobalModerator(userid);
  if (globMod) return true;
  // just get a list a channels I'm a mod for...
  const channels = await storage.getChannelModerator(userid);
  if (channels.length) {
    return channels.join(',');
  }
  // finally check local disk config
  const configVal = config.globalAllow(userid);
  return configVal ? configVal : false;
}

module.exports = {
  setup,
  getUserAccess
};
