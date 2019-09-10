const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const assert = require('assert');
const ini = require('loki-launcher/ini');
const lokinet = require('loki-launcher/lokinet');
const crypto = require('crypto');
const bb = require('bytebuffer');
const libsignal = require('libsignal');
const adnServerAPI = require('../fetchWrapper');

// Look for a config file
const ini_bytes = fs.readFileSync('loki.ini');
disk_config = ini.iniToJSON(ini_bytes.toString());

//console.log('disk_config', disk_config)
const overlay_port = parseInt(disk_config.api.port) || 8080;
// has to have the trailing slash
const overlay_url = 'http://localhost:' + overlay_port + '/';

const platform_api_url = disk_config.api.api_url;
const platform_admin_url = disk_config.api.admin_url.replace(/\/$/, '');

const ensurePlatformServer = () => {
  return new Promise((resolve, rej) => {
    const platformURL = new URL(platform_api_url);
    console.log('platform port', platformURL.port);
    lokinet.portIsFree(platformURL.hostname, platformURL.port, function(free) {
      if (free) {
        const startPlatform = require('../server/app');
      } else {
        console.log('detected running platform server using that');
      }
      resolve();
    })
  });
};

const ensureOverlayServer = () => {
  return new Promise((resolve, rej) => {
    console.log('overlay port', overlay_port);
    lokinet.portIsFree('localhost', overlay_port, function(free) {
      if (free) {
        const startPlatform = require('../overlay_server');
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
  const modKeys = Object.keys(disk_config.globals);
  if (!modKeys.length) {
    console.warn('no moderators configured, skipping moderation tests');
    return;
  }
  const selectedMod = Math.floor(Math.random() * modKeys.length);
  //console.log('selectedMod', selectedMod);
  modPubKey = modKeys[selectedMod];
  if (!modPubKey) {
    console.warn('selectedMod', selectedMod, 'not in', modKeys.length);
    return;
  }
  const res = await adminApi.serverRequest('tokens/@'+modPubKey, {});
  //console.log('token res', res);
  modToken = res.response.data.token;
  return modToken;
}

// make our local keypair
const ourKey = libsignal.curve.generateKeyPair();
// encode server's pubKey in base64
const ourPubKey64 = bb.wrap(ourKey.pubKey).toString('base64');
const ourPubKeyHex = bb.wrap(ourKey.pubKey).toString('hex');

async function DHDecrypt(symmetricKey, ivAndCiphertext) {
  const iv = ivAndCiphertext.slice(0, IV_LENGTH);
  const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
  return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
}

// globally passing overlayApi
function get_challenge(ourKey, ourPubKeyHex) {
  return new Promise((resolve, rej) => {
    describe(`get challenge for ${ourPubKeyHex} /loki/v1/get_challenge`, async () => {
      // this can be broken into more it() if desired
      //it("returns status code 200", async () => {
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
        const tokenString = token.toString('utf8');
        //console.log('tokenString', tokenString);
        resolve(tokenString);
      //});
    });
  });
}

function submit_challenge(tokenString) {
  return new Promise((resolve, rej) => {
    describe(`submit challenge for ${tokenString} /loki/v1/submit_challenge`, async () => {
      //it("returns status code 200", async () => {
        const result = await overlayApi.serverRequest('loki/v1/submit_challenge', {
          method: 'POST',
          objBody: {
            pubKey: ourPubKeyHex,
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
function user_info() {
  return new Promise((resolve, rej) => {
    describe("get user_info /loki/v1/user_info", async () => {
      //it("returns status code 200", async () => {
        const result = await overlayApi.serverRequest('loki/v1/user_info');
        assert.equal(200, result.statusCode);
        //console.log('get user_info body', body);
        // {"meta":{"code":200},"data":{
        // "user_id":10,"client_id":"messenger",
        //"scopes":"basic stream write_post follow messages update_profile files export",
        //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
        resolve();
      //});
    });
  });
}

function get_deletes(channelId) {
  return new Promise((resolve, rej) => {
    describe("get deletes /loki/v1/channel/1/deletes", async () => {
      //it("returns status code 200", async () => {
        const result = await overlayApi.serverRequest('loki/v1/channel/1/deletes');
        assert.equal(200, result.statusCode);
        resolve();
      //});
    });
  });
}

function create_message(channelId) {
  return new Promise((resolve, rej) => {
    describe("create message /channels/1/messages", async () => {
      //it("returns status code 200", async () => {
        // create a dummy message
        const result = await platformApi.serverRequest('channels/1/messages', {
          method: 'POST',
          objBody: {
            text: 'testing message',
          },
        });
        assert.equal(200, result.statusCode);
        resolve(result.response.data.id);
      //});
    });
  });
}

function get_channel(channelId) {
  return new Promise(async (resolve, rej) => {
    // not really a test
    //describe(`get channel /channels/${channelId}`, () => {
      //it("returns status code 200", async () => {
        // get a channel
        const result = await platformApi.serverRequest(`channels/${channelId}`);
        //assert.equal(200, result.statusCode);
        resolve(result.response.data);
      //});
    //});
  });
}

function admin_create_channel() {
  return new Promise((resolve, rej) => {
    // well this should at least not fail...
    // but not really the target of our testing...
    describe(`create channel /channels`, async () => {
      //it("returns status code 200", async () => {
        // create a dummy message
        const result = await platformApi.serverRequest('channels', {
          method: 'POST',
          objBody: {
            type: 'moe.sapphire.test',
          },
        });
        assert.equal(200, result.statusCode);
        resolve(result.response.data.id);
      //});
    });
  });
}

function mod_delete_message(channelId, messageId) {
  return new Promise((resolve, rej) => {
    describe("modDelete message /loki/v1/moderation/message/" + messageId, async () =>{
      //it("returns status code 200", async () => {
        // test delete endpoint
        const result = await overlayApi.serverRequest('loki/v1/moderation/message/'+messageId, {
          method: 'DELETE',
        });
        assert.equal(200, result.statusCode);
        //console.log('modDelete message body', body);
        // {"meta":{"code":200},"data":{
        // "user_id":10,"client_id":"messenger",
        //"scopes":"basic stream write_post follow messages update_profile files export",
        //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
        resolve();
      });
    //});
  });
}

const runIntegrationTests = async (ourKey, ourPubKeyHex) => {
  describe('ensurePlatformServer', async () => {
    it('make sure we have something to storage with', async () => {
      await ensurePlatformServer();
    });
  });
  describe('ensureOverlayServer', async () => {
    it('make sure we have something to test', async () => {
      await ensureOverlayServer();
    });
  });
  let channelId = 3; // default channel to try to test first

  // get our token
  let tokenString
  describe('get our token', () => {
    it('get token', async () => {
      tokenString = await get_challenge(ourKey, ourPubKeyHex);
    });
    it('activate token', async () => {
      // activate token
      await submit_challenge(tokenString);
    });
    it('set token', async () => {
      // set token
      overlayApi.token = tokenString;
      platformApi.token = tokenString;
    });

    it('user info', async () => {
      // test token endpoints
      user_info(tokenString);
    });

    // make sure we have a channel to test with
    describe(`channel testing`, () => {
      it('make sure we have a channel to test', async (done) => {
        const chnlCheck = await get_channel(channelId);
        if (Array.isArray(chnlCheck)) {
          // make a channel for testing
          channelId = await admin_create_channel();
          console.log('created channel', channelId);
        }
        done();
      });
      let modToken
      it('we have moderator to test with', async (done) => {
        // now do moderation tests
        modToken = await selectModToken();
        if (!modToken) {
          console.error('No modToken, skipping moderation tests');
          // all tests should be complete
          //process.exit(0);
          return;
        }
        overlayApi.token = modToken;
        done();
      });
      let messageId
      it('create message to test with', async (done) => {
        // well we need to create a new message for moderation test
        messageId = await create_message(channelId);
        //console.log('messageId', messageId);
        done();
      });
      it('mod delete test', async (done) => {
        await mod_delete_message(channelId, messageId);
        done();
      });
      it('can get deletes for channel', (done) => {
        get_deletes(channelId);
        done();
      });
    });
  });

  // all tests should be complete
  //console.log('all done!')
  //process.exit(0);
}

//console.log('bob');
runIntegrationTests(ourKey, ourPubKeyHex);
