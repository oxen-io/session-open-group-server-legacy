const fs           = require('fs');
const path         = require('path');
const nconf        = require('nconf');
const assert       = require('assert');
const ini          = require('loki-launcher/ini');
const lokinet      = require('loki-launcher/lokinet');
const crypto       = require('crypto');
const bb           = require('bytebuffer');
const libsignal    = require('libsignal');
const adnServerAPI = require('../fetchWrapper');
const config       = require('../config');

const ADN_SCOPES = 'basic stream write_post follow messages update_profile files export';

// Look for a config file
//const ini_bytes = fs.readFileSync('loki.ini');
//disk_config = ini.iniToJSON(ini_bytes.toString());
const disk_config = config.getDiskConfig();

//console.log('disk_config', disk_config)
const overlay_port = parseInt(disk_config.api.port) || 8080;
// has to have the trailing slash
const overlay_url = 'http://localhost:' + overlay_port + '/';

const config_path = path.join(__dirname, '/../server/config.json');
nconf.argv().env('__').file({file: config_path});
console.log('config_path', config_path);

const platform_api_url = disk_config.api.api_url;
const platform_admin_url = disk_config.api.admin_url.replace(/\/$/, '');

// configure the admin interface for use
// can be easily swapped out later
const proxyAdmin = require('../server/dataaccess.proxy-admin');
// fake dispatcher that only implements what we need
proxyAdmin.dispatcher = {
  // ignore local user updates
  updateUser: (user, ts, cb) => { cb(user); },
  // ignore local message updates
  setMessage: (message, cb) => { if (cb) cb(message); },
}
// backward compatible
if (proxyAdmin.start) {
  proxyAdmin.start(nconf);
}
proxyAdmin.apiroot = disk_config.api.api_url;
if (proxyAdmin.apiroot.replace) {
  proxyAdmin.apiroot = proxyAdmin.apiroot.replace(/\/$/, '');
}
proxyAdmin.adminroot = disk_config.api.admin_url;
if (proxyAdmin.adminroot.replace) {
  proxyAdmin.adminroot = proxyAdmin.adminroot.replace(/\/$/, '');
}

const cache = proxyAdmin

const ensurePlatformServer = () => {
  return new Promise((resolve, rej) => {
    const platformURL = new URL(platform_api_url);
    console.log('platform port', platformURL.port);
    lokinet.portIsFree(platformURL.hostname, platformURL.port, function(free) {
      if (free) {
        // ini overrides server/config.json in unit testing (if platform isn't running where it should)
        // override any config to make sure it runs the way we request
        process.env.web__port = platformURL.port;
        const platformAdminURL = new URL(platform_admin_url);
        process.env.admin__port = platformAdminURL.port;
        process.env.admin__modKey = disk_config.api.modKey?disk_config.api.modKey:'123abc';
        const startPlatform = require('../server/app');

        // probably don't need this wait
        function portNowClaimed() {
          lokinet.portIsFree(platformURL.hostname, platformURL.port, function(free) {
            if (!free) {
              console.log(platformURL.port, 'now claimed')
              resolve();
            } else {
              setTimeout(portNowClaimed, 100)
            }
          })
        }
        portNowClaimed()

      } else {
        console.log('detected running platform server using that');
        resolve();
      }
    })
  });
};

let weStartedOverlayServer = false;
const ensureOverlayServer = () => {
  return new Promise((resolve, rej) => {
    console.log('overlay port', overlay_port);
    lokinet.portIsFree('localhost', overlay_port, function(free) {
      if (free) {
        const startPlatform = require('../overlay_server');
        weStartedOverlayServer = true;
      } else {
        console.log('detected running overlay server testing that');
      }
      resolve();
    });
  });
};

const IV_LENGTH = 16;

/*
const config_path = path.join(__dirname, '/../server/config.json');
console.log('config_path', config_path);
// and a model file
const config_model_path = path.join(__dirname, '/config.models.json');
nconf.argv().env('__').file({file: config_path}).file('model', {file: config_model_path});

let webport = nconf.get('web:port') || 7070;
const base_url = 'http://localhost:' + webport + '/'
console.log('read', base_url)
*/

const overlayApi  = new adnServerAPI(overlay_url);
const platformApi = new adnServerAPI(platform_api_url);
const adminApi    = new adnServerAPI(platform_admin_url, disk_config.api.modKey);

let modPubKey = '';

// grab a mod from ini
const selectModToken = async () => {
  if (!disk_config.globals && !weStartedOverlayServer) {
    console.warn('no moderators configured, skipping moderation tests');
    return;
  }
  let modKeys = []
  if (disk_config.globals) {
    modKeys = Object.keys(disk_config.globals);
  }
  //console.log('modKeys', modKeys.length);
  let modToken = '';
  if (!modKeys.length) {
    // we started platform?
    //console.log('weStartedOverlayServer', weStartedOverlayServer);
    if (weStartedOverlayServer) {
      console.warn('test.js - no moderators configured and we control overlayServer, creating temporary moderator');
      const ourModKey = libsignal.curve.generateKeyPair();
      // encode server's pubKey in base64
      const ourModPubKey64 = bb.wrap(ourModKey.pubKey).toString('base64');
      const modPubKey = bb.wrap(ourModKey.pubKey).toString('hex');
      modToken = await get_challenge(ourModKey, modPubKey);
      await submit_challenge(modToken, modPubKey);
      // now elevate to a moderator
      var promise = new Promise( (resolve,rej) => {
        cache.getUserID(modPubKey, async (user, err) => {
          await config.addTempModerator(user.id)
          resolve()
        });
      });
      await promise;
      return modToken;
    } else {
      console.warn('no moderators configured, skipping moderation tests');
      return;
    }
  }
  const selectedMod = Math.floor(Math.random() * modKeys.length);
  //console.log('selectedMod', selectedMod);
  modPubKey = modKeys[selectedMod];
  if (!modPubKey) {
    console.warn('selectedMod', selectedMod, 'not in', modKeys.length);
    return;
  }
  const res = await adminApi.serverRequest('tokens/@'+modPubKey, {});
  if (res.response && res.response.data) {
    modToken = res.response.data.token;
  }
  // it's async
  /*
  if (res.response && res.response.data === null) {
    console.log('need to create a token for this moderator')
    cache.getUserID(modPubKey, (user, err) => {
      if (err) console.error('getUserID err', err)
      if (!user || !user.id) {
        console.warn('No such moderator user object for', modPubKey);
        // create user...
        process.exit();
      }
      cache.createOrFindUserToken(user.id, 'messenger', ADN_SCOPES, (tokenObj, err) => {
        if (err) console.error('createOrFindUserToken err', err)
        console.log('tokenObj', tokenObj);
      })
    })
  }
  */
  if (!modToken) console.warn('modToken failure! res', res);
  return modToken;
}

// make our local keypair
const ourKey = libsignal.curve.generateKeyPair();
// encode server's pubKey in base64
const ourPubKey64 = bb.wrap(ourKey.pubKey).toString('base64');
const ourPubKeyHex = bb.wrap(ourKey.pubKey).toString('hex');
console.log('running as', ourPubKeyHex);

const DHDecrypt = async (symmetricKey, ivAndCiphertext) => {
  const iv = ivAndCiphertext.slice(0, IV_LENGTH);
  const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
  return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
}

// globally passing overlayApi
function get_challenge(ourKey, ourPubKeyHex) {
  return new Promise((resolve, rej) => {
    describe(`get challenge for ${ourPubKeyHex} /loki/v1/get_challenge`, async function() {
      // this can be broken into more it() if desired
      //it("returns status code 200", async () => {
      let tokenString
      try {
        const result = await overlayApi.serverRequest('loki/v1/get_challenge', {
          params: {
           pubKey: ourPubKeyHex
          }
        });
        assert.equal(200, result.statusCode);
        const body = result.response;
        //console.log('get challenge body', body);
        // body.cipherText64
        // body.serverPubKey64 // base64 encoded pubkey

        // console.log('serverPubKey64', body.serverPubKey64);
        const serverPubKeyBuff = Buffer.from(body.serverPubKey64, 'base64')
        const serverPubKeyHex = serverPubKeyBuff.toString('hex');
        //console.log('serverPubKeyHex', serverPubKeyHex)

        const ivAndCiphertext = Buffer.from(body.cipherText64, 'base64');

        const symmetricKey = libsignal.curve.calculateAgreement(
          serverPubKeyBuff,
          ourKey.privKey
        );
        const token = await DHDecrypt(symmetricKey, ivAndCiphertext);
        tokenString = token.toString('utf8');
      } catch (e) {
        console.error('platformApi.serverRequest err', e, result)
        tokenString = '';
      }

      //console.log('tokenString', tokenString);
      resolve(tokenString);
      //});
    });
  });
}

const submit_challenge = (tokenString, pubKey) => {
  // we use this promise to delay resolution
  return new Promise((resolve, rej) => {
    // I don't think we need or want this describe at all...
    describe(`submit challenge for ${tokenString} /loki/v1/submit_challenge`, async function() {
      //it("returns status code 200", async () => {
        const result = await overlayApi.serverRequest('loki/v1/submit_challenge', {
          method: 'POST',
          objBody: {
            pubKey: pubKey,
            token: tokenString,
          },
          noJson: true
        });
        assert.equal(200, result.statusCode);
        // body should be ''
        //console.log('submit challenge body', body);
        resolve();
      //});
    });
  });
}

// requires overlayApi to be configured with a token
function getUserID(pubKey) {
  return new Promise((resolve, rej) => {
    cache.getUserID(pubKey, function(user, err, meta) {
      //assert.equal(200, result.statusCode);
      resolve(user.id);
    });
  });
}

function get_deletes(channelId) {
  return new Promise((resolve, rej) => {
    describe("get deletes /loki/v1/channels/1/deletes", async function() {
      //it("returns status code 200", async () => {
        const result = await overlayApi.serverRequest('loki/v1/channels/1/deletes');
        assert.equal(200, result.statusCode);
        resolve();
      //});
    });
  });
}

function get_moderators(channelId) {
  return new Promise((resolve, rej) => {
    describe("get moderators /loki/v1/channels/1/moderators", async function() {
      //it("returns status code 200", async () => {
      let result
      try {
        result = await overlayApi.serverRequest('loki/v1/channels/1/moderators');
        assert.equal(200, result.statusCode);
      } catch (e) {
        console.error('platformApi.serverRequest err', e, result)
        rej();
      }
      resolve();
      //});
    });
  });
}

function create_message(channelId) {
  return new Promise((resolve, rej) => {
    describe("create message /channels/1/messages", async function() {
      //it("returns status code 200", async () => {
        // create a dummy message
        let result;
        try {
          result = await platformApi.serverRequest('channels/1/messages', {
            method: 'POST',
            objBody: {
              text: 'testing message',
            },
          });
          //console.log('create message result', result, 'token', platformApi.token);
          assert.equal(200, result.statusCode);
        } catch (e) {
          console.error('platformApi.serverRequest err', e, result)
        }
        resolve(result.response.data.id);
      //});
    });
  });
}

function get_message(messageId) {
  return new Promise(async (resolve, rej) => {
    // not really a test
    //describe(`get channel /channels/${channelId}`, function() {
      //it("returns status code 200", async () => {
        // get a channel
        const result = await platformApi.serverRequest(`channels/messages`, {
          params: {
            ids: messageId
          }
        });
        //assert.equal(200, result.statusCode);
        resolve(result.response.data);
      //});
    //});
  });
}

const runIntegrationTests = async (ourKey, ourPubKeyHex) => {
  let channelId = 3; // default channel to try to test first

  // get our token
  let tokenString
  describe('get our token', function() {
    it('get token', async function() {
      tokenString = await get_challenge(ourKey, ourPubKeyHex);
    });
    it('activate token', async function() {
      // activate token
      await submit_challenge(tokenString, ourPubKeyHex);
    });
    it('set token', async function() {
      // set token
      overlayApi.token = tokenString;
      platformApi.token = tokenString;
    });

    it('user info (non-mod)', async function() {
      // test token endpoints
      const result = await overlayApi.serverRequest('loki/v1/user_info');
      //console.log('user user_info result', result)
      assert.equal(200, result.statusCode);
      assert.ok(result.response);
      assert.ok(result.response.data);
      // we're a freshly created user (hopefully)
      assert.ok(!result.response.data.moderator_status);
    });

    // test moderator security...
    describe('moderator security tests', function() {
      it('cant blacklist', async function() {
        //console.log('key', ourPubKeyHex);
        const userid = await getUserID(ourPubKeyHex);
        assert.ok(userid);
        //console.log('userid', userid);
        const result = await overlayApi.serverRequest(`loki/v1/moderation/blacklist/${userid}`, {
          method: 'POST',
        });
        //console.log('after blacklist attempt', result);
/*
{
  err: 'statusCode',
  statusCode: 401,
  response: {
    meta: {
      code: 401,
      error_message: 'Call requires authentication: Authentication required to fetch token.'
    }
  }
}
*/
        assert.equal(401, result.statusCode);
      });
    });

    // make sure we have a channel to test with
    describe('channel testing', function() {
      it('make sure we have a channel to test', async function() {
        const result = await platformApi.serverRequest(`channels/${channelId}`, {
          params: {
            include_recent_message: 1
          }
        });
        const chnlCheck = result.response.data;
        if (Array.isArray(chnlCheck)) {
          // make a channel for testing
          const result = await platformApi.serverRequest('channels', {
            method: 'POST',
            objBody: {
              type: 'moe.sapphire.test',
            },
          });
          assert.equal(200, result.statusCode);
          channelId = result.response.data.id;
          console.log('created channel', channelId);
        }
      });
      let messageId, messageId1, messageId2, messageId3, messageId4
      it('create message to test with', async function() {
        // well we need to create a new message for moderation test
        messageId = await create_message(channelId);
        //let message = await get_message(messageId);
        //console.log('message1', message);
        messageId1 = await create_message(channelId);
        //message = await get_message(messageId1);
        //console.log('message2', message);
        messageId2 = await create_message(channelId);
        //message = await get_message(messageId2);
        //console.log('message3', message);
        messageId3 = await create_message(channelId);
        //message = await get_message(messageId3);
        //console.log('message4', message);
        messageId4 = await create_message(channelId);
        //message = await get_message(messageId4);
        //console.log('message5', message);
        //console.log('messageId', messageId);
      });
      it('user cant mod delete', async function() {
        const result = await overlayApi.serverRequest(`loki/v1/moderation/message/${messageId}`, {
          method: 'DELETE',
        });
        assert.equal(401, result.statusCode);
      });
      it('user multi delete test', async function () {
        //let message = await get_message(messageId);
        //console.log('message before', message);
        if (messageId3 && messageId4) {
          const result = await overlayApi.serverRequest('loki/v1/messages', {
            method: 'DELETE',
            params: {
              ids: [messageId3, messageId4].join(',')
            }
          });
        } else {
          console.log('skipping')
        }
        //message = await get_message(messageId);
        //console.log('message after', message);
      });
      it('can get deletes for channel', function() {
        get_deletes(channelId);
      });
      it('can get moderators for channel', function() {
        get_moderators(channelId);
      });
      // Moderator only functions
      describe('channel moderator testing', function() {
        let modToken
        it('we have moderator to test with', async function() {
          // now do moderation tests
          modToken = await selectModToken();
          if (!modToken) {
            console.error('No modToken, skipping moderation tests');
            // all tests should be complete
            //process.exit(0);
            return;
          }
          console.log('Setting modToken to', modToken);
          overlayApi.token = modToken;
        });
        it('mod user info', async function() {
          // test token endpoints
          const result = await overlayApi.serverRequest('loki/v1/user_info');
          //console.log('mod user_info result', result)
          assert.equal(200, result.statusCode);
          assert.ok(result.response);
          assert.ok(result.response.data);
          assert.ok(result.response.data.moderator_status);
          // || result.response.moderator_status.match(',')
          // I think we only should be global here for now...
          assert.equal(true, result.response.data.moderator_status === true);
        });
        it('mod delete test', async function() {
          if (modToken && messageId) {
            //let message = await get_message(messageId);
            //console.log('message1', message);
            const result = await overlayApi.serverRequest(`loki/v1/moderation/message/${messageId}`, {
              method: 'DELETE',
            });
            assert.equal(200, result.statusCode);
          } else {
            console.log('skipping modSingleDelete');
          }
        });
        it('mod multi delete test', async function() {
          if (modToken && messageId1 && messageId2) {
            const result = await overlayApi.serverRequest('loki/v1/moderation/messages', {
              method: 'DELETE',
              params: {
                ids: [messageId1, messageId2].join(',')
              }
            });
            assert.equal(200, result.statusCode);
          } else {
            console.log('skipping modMutliDelete');
          }
        });
      });

      describe('blacklist testing', function() {
        it('make sure token is still valid', async function() {
          // test token endpoints
          const result = await overlayApi.serverRequest('loki/v1/user_info');
          //console.log('user user_info result', result)
          assert.equal(200, result.statusCode);
          assert.ok(result.response);
          assert.ok(result.response.data);
        });
        it('blacklist', async function() {
          //console.log('key', ourPubKeyHex);
          const userid = await getUserID(ourPubKeyHex);
          assert.ok(userid);
          //console.log('userid', userid);
          const result = await overlayApi.serverRequest(`loki/v1/moderation/blacklist/${userid}`, {
            method: 'POST',
          });
          //console.log('after blacklist', result);
          assert.equal(200, result.statusCode);
          assert.ok(result.response);
          assert.ok(result.response.data);
        });
        it('switch back to banned user', async function() {
          //console.log('changing back to', tokenString);
          overlayApi.token = tokenString;
        });
        it('banned token vs platform', async function() {
          //user_info();
          try {
            const result = await platformApi.serverRequest('token');
            assert.equal(401, result.statusCode);
          } catch(e) {
            console.error('e', e);
          }
        });
        it('banned token vs overlay', async function() {
          //user_info();
          try {
            const result = await overlayApi.serverRequest('loki/v1/user_info');
            assert.equal(401, result.statusCode);
          } catch(e) {
            console.error('e', e);
          }
        });
        it('try to reregister with banned token', async function() {
          const result = await overlayApi.serverRequest('loki/v1/get_challenge', {
            params: {
             pubKey: ourPubKeyHex
            }
          });
          assert.equal(401, result.statusCode);
          //console.log('tokenString', result)
        });
      });
    });
  });
}

// you can't use => with mocha, you'll loose this context
before(async function() {
  //this.timeout(60 * 1000); // can't be in an arrow function
  await ensurePlatformServer();
  console.log('platform ready');
  await ensureOverlayServer();
  console.log('overlay ready');
})
runIntegrationTests(ourKey, ourPubKeyHex);
