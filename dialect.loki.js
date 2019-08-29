const fs        = require('fs');
const crypto    = require('crypto');
const bb        = require('bytebuffer');
const libsignal = require('libsignal');
const ini       = require('loki-launcher/ini')

const SESSION_TTL_MSECS = 120000;
const TOKEN_TTL_MINS = 60;

const ADN_SCOPES = 'basic stream write_post follow messages update_profile files export';
const IV_LENGTH = 16;

// mount will set this
var cache;

// our temp database for ephemeral data
const tempDB = {};

// create the abstraction layer, so this can be scaled into IPC later on

//
// start tempdb abstraction layer
//

// registers a token, and it's expiration
// if it's gets validated, it will be promoted
const addTempStorage = (pubKey, token) => {
  if(!tempDB[pubKey]) {
    tempDB[pubKey] = [];
  }
  // consider moving the expiration out of this layer?
  tempDB[pubKey].push({
    token,
    timer: setTimeout(() => {
      deleteTempStorageForToken(pubKey, token)
    }, SESSION_TTL_MSECS)
  });
}

const deleteTempStorageForToken = (pubKey, token) => {
  // maybe an array check?
  if (tempDB[pubKey] === undefined) return
  for(var i in tempDB[pubKey]) {
    var currentToken = tempDB[pubKey][i]
    if (currentToken.token === token) {
      // remove it by index
      clearTimeout(currentToken.timer)
      tempDB[pubKey].splice(i, 1);
      if (!tempDB[pubKey].length) {
        // was the last
        delete tempDB[pubKey];
        return;
      }
      // continue incase there's more than one
    }
  }
}

const checkTempStorageForToken = (token) => {
  // check temp storage
  for(var usedToken in tempDB) {
    if (usedToken === token) return true;
  }
  return false;
}

//
// end tempdb abstraction layer
//

// verify a token is not in use
const findToken = (token) => {
  return new Promise((res, rej) => {
    // if not found in temp storage
    if (checkTempStorageForToken(token)) {
      return res(true);
    }
    // check database
    cache.getAPIUserToken(token, function(usertoken, err) {
      if (err) {
        return rej(err);
      }
      // report back existence
      res(usertoken?true:false);
    });
  });
}

// make a token-like string
const generateString = () => {
  // Temp function
  const TOKEN_LEN = 96;
  let token = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < TOKEN_LEN; i++) {
    token += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return token;
}

const createToken = (pubKey) => {
  return new Promise((res, rej) => {
    findOrCreateUser(pubKey)
      .then(async user => {
        // generate new random token and make sure it's not in use
        let inUse = true;
        while(inUse) {
          token = generateString();
          inUse = await findToken(token);
        }
        res(token)
      })
      .catch(e => {
        rej(e);
      });
  })
}

const findOrCreateUser = (pubKey) => {
  return new Promise((res, rej) => {
    cache.getUserID(pubKey, (user, err) => {
      if (err) {
        rej(err);
        return;
      }
      if (user === null) {
        // create user
        // "password" (2nd) parameter is not saved/used
        cache.addUser(pubKey, '', (newUser, err2) => {
          if (err2) {
            rej(err2);
          } else {
            res(newUser);
          }
        })
      } else {
        // we have this user
        res(user);
      }
    })
  })
}

const confirmToken = (pubKey, token) => {
  return new Promise(async (res, rej) => {
    // Check to ensure the token submitted has been generated in the last 2 minutes
    if (!checkTempStorageForToken(pubKey, token)) {
      return rej('invalid');
    }
    // Token has been recently generated
    // finally ensure user for pubKey
    const userObj = await findOrCreateUser(pubKey);
    if (!userObj) {
      return rej('user');
    }
    // promote token to usable for user
    cache.addUnconstrainedAPIUserToken(userObj.id, 'messenger', ADN_SCOPES, token, TOKEN_TTL_MINS, function(tokenObj, err) {
      if (err) {
        // we'll keep the token in the temp storage, so they can retry
        return rej('tokenCreation');
      }
      // ok token is now registered
      // remove from temp storage
      deleteTempStorageForToken(pubKey, token);
      // return success
      res(true);
    });
  })
}

const getChallenge = async (pubKey) => {
  const serverKey = libsignal.curve.generateKeyPair();
  const serverPubKey64 = bb.wrap(serverKey.pubKey).toString('base64');

  const pubKeyData = Buffer.from(bb.wrap(pubKey, 'hex').toArrayBuffer());
  const symKey = libsignal.curve.calculateAgreement(
    pubKeyData,
    serverKey.privKey
  );

  const token = await createToken(pubKey);
  addTempStorage(pubKey, token);

  const tokenData = Buffer.from(bb.wrap(token).toArrayBuffer());

  const iv = crypto.randomBytes(IV_LENGTH);
  const iv64 = bb.wrap(iv).toString('base64');

  const ciphertext = await libsignal.crypto.encrypt(
    symKey,
    tokenData,
    iv
  );
  const ivAndCiphertext = new Uint8Array(
    iv.byteLength + ciphertext.byteLength
  );
  ivAndCiphertext.set(new Uint8Array(iv));
  ivAndCiphertext.set(new Uint8Array(ciphertext), iv.byteLength);

  const cipherText64 = bb.wrap(ivAndCiphertext).toString('base64');

  return {
    cipherText64,
    serverPubKey64,
  };
}

function sendresponse(json, resp) {
  var ts=new Date().getTime();
  var diff = ts-resp.start;
  if (diff > 1000) {
    // this could be to do the client's connection speed
    // how because we stop the clock before we send the response...
    console.log(resp.path+' served in '+(ts-resp.start)+'ms');
  }
  if (json.meta.code) {
    resp.status(json.meta.code);
  }
  if (resp.prettyPrint) {
    json=JSON.stringify(json,null,4);
  }
  //resp.set('Content-Type', 'text/javascript');
  resp.type('application/json');
  resp.setHeader("Access-Control-Allow-Origin", "*");
  resp.send(json);
}

module.exports=function mount(app, prefix) {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;

  let user_access = {};
  let pubkey_whitelist = {};

  function updateUserAccess() {
    if (fs.existsSync('loki.ini')) {
      const ini_bytes = fs.readFileSync('loki.ini')
      disk_config = ini.iniToJSON(ini_bytes.toString())
      console.log('config', disk_config);

      // reset permissions to purge any deletions
      user_access = {};
      // load globals pubkeys from file and set their access level
      for(var pubKey in disk_config.globals) {
        const access = disk_config.globals[pubKey];
        // translate pubKey to id of user
        cache.getUserID(pubKey, function(user, err) {
          //console.log('setting', user.id, 'to', access);

          // only if user has registered
          if (user) {
            user_access[user.id] = access;
          }
        })
      }
    }
  }
  updateUserAccess()
  // update every 15 mins
  setInterval(updateUserAccess, 15 * 60 * 1000)

  function passesWhitelist(pubKey) {
    // if we have a whitelist
    if (disk_config.whitelist && !disk_config.whitelist[pubKey]) {
      // and you're not on it
      return false;
    }
    // by default everyone is allowed
    return true;
  }

  app.post(prefix + '/loki/v1/submit_challenge', (req, res) => {
    const { pubKey, token } = req.body;
    if (!pubKey) {
      console.log('submit_challenge pubKey missing');
      res.status(422).type('application/json').end(JSON.stringify({
        error: 'pubKey missing',
      }));
      return;
    }
    if (!passesWhitelist(pubKey)) {
      console.log('get_challenge ', pubKey, 'not whitelisted');
      return res.status(401).type('application/json').end(JSON.stringify({
        error: 'not allowed',
      }));
    }
    if (!token) {
      console.log('submit_challenge token missing');
      res.status(422).type('application/json').end(JSON.stringify({
        error: 'token missing',
      }));
      return;
    }
    if (confirmToken(pubKey, token)) {
      res.status(200).end();
    } else {
      res.status(500).end();
    }
  });

  app.get(prefix + '/loki/v1/get_challenge', (req, res) => {
    const { pubKey } = req.query;
    if (!pubKey) {
      console.log('get_challenge pubKey missing');
      res.status(422).type('application/json').end(JSON.stringify({
        error: 'PubKey missing',
      }));
      return;
    }

    if (!passesWhitelist(pubKey)) {
      console.log('get_challenge ', pubKey, 'not whitelisted');
      return res.status(401).type('application/json').end(JSON.stringify({
        error: 'not allowed',
      }));
    }

    getChallenge(pubKey).then(keyInfo => {
      res.status(200).type('application/json').end(JSON.stringify(keyInfo));
    }).catch(err => {
      console.log(`Error getting challenge: ${err}`);
      res.status(500).type('application/json').end(JSON.stringify({
        error: err.toString(),
      }));
      return;
    })
  });

  function validUser(token, res, cb) {
    app.dispatcher.getUserClientByToken(token, function(usertoken, err) {
      if (err) {
        console.error('token err', err);
        const resObj={
          meta: {
            code: 500,
            error_message: err
          }
        };
        return sendresponse(resObj, res);
      }
      if (usertoken === null) {
        // could be they didn't log in through a server restart
        const resObj={
          meta: {
            code: 401,
            error_message: "Call requires authentication: Authentication required to fetch token."
          }
        };
        return sendresponse(resObj, res);
      }
      cb(usertoken)
    })
  }

  function validGlobal(token, res, cb) {
    validUser(token, res, function(usertoken) {
      const list = user_access[usertoken.userid]
      if (!list) {
        // not even on the list
        const resObj={
          meta: {
            code: 401,
            error_message: "Call requires authentication: Authentication required to fetch token."
          }
        };
        return sendresponse(resObj, res);
      }
      if (list.match && list.match(/,/)) {
        return cb(usertoken, list.split(/,/))
      }
      cb(usertoken, true)
    })
  }

  app.get(prefix + '/loki/v1/user_info', (req, res) => {
    validUser(req.token, res, function(usertoken) {
      //console.log('usertoken',  JSON.stringify(usertoken))
      const resObj={
        meta: {
          code: 200,
        },
        data: {
          user_id: usertoken.userid,
          client_id: usertoken.client_id,
          scopes: usertoken.scopes,
          created_at: usertoken.created_at,
          expires_at: usertoken.expires_at,
          moderator_status: user_access[usertoken.userid],
        }
      };
      return sendresponse(resObj, res);
    })
  })

  app.get(prefix + '/loki/v1/channel/:id/deletes', (req, res) => {
    const numId = parseInt(req.params.id);
    //console.log('numId', numId)
    cache.getChannelDeletions(numId, req.apiParams, function(interactions, err, meta) {
      //console.log('interactions', interactions)
      var items = []
      for(var i in interactions) {
        items.push({
          delete_at: interactions[i].datetime,
          message_id: interactions[i].typeid,
          id: interactions[i].id
        })
      }
      const resObj={
        meta: meta,
        data: items
      };
      return sendresponse(resObj, res);
    })
  })

  app.delete(prefix + '/loki/v1/moderation/message/:id', (req, res) => {
    validGlobal(req.token, res, function(usertoken, access_list) {
      // FIXME: support comma-separate list of IDs

      // get message channel
      var numId = parseInt(req.params.id);
      cache.getMessage(numId, function(message, getErr) {
        // handle errors
        if (getErr) {
          console.error('getMessage err', getErr);
          const resObj={
            meta: {
              code: 500,
              error_message: getErr
            }
          };
          return sendresponse(resObj, res);
        }

        // handle already deleted messages
        if (!message || message.is_deleted) {
          const resObj={
            meta: {
              code: 410,
            }
          };
          return sendresponse(resObj, res);
        }

        // if not full access
        if (access_list !== true) {
          // see if this message's channel is on the list
          var allowed = access_list.indexOf(message.channel_id);
          if (allowed == -1) {
            // not allowed to manage this channel
            const resObj={
              meta: {
                code: 403,
                error_message: "You're not allowed to moderation this channel"
              }
            };
            return sendresponse(resObj, res);
          }
        }

        // carry out deletion
        cache.deleteMessage(message.id, message.channel_id, function(message, delErr) {
          // handle errors
          if (delErr) {
            console.error('deleteMessage err', delErr);
            const resObj={
              meta: {
                code: 500,
                error_message: delErr
              }
            };
            return sendresponse(resObj, res);
          }
          //console.log('usertoken',  JSON.stringify(usertoken))
          const resObj={
            meta: {
              code: 200,
            },
            data: {
              is_deleted: true
            }
          };
          return sendresponse(resObj, res);
        })
      })
    })

  })
}
