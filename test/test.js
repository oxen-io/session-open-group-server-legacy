const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const request = require('request');
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

const platformURL = new URL(platform_api_url);
console.log('platform port', platformURL.port);
lokinet.portIsFree(platformURL.hostname, platformURL.port, function(free) {
  if (free) {
    const startPlatform = require('../server/app');
  } else {
    console.log('detected running server');
  }
})

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

let modPubKey = '';

// grab a mod from ini
const selectModToken = async () => {
  const modKeys = Object.keys(disk_config.globals);
  if (modKeys.length) {
    const selectedMod = Math.floor(Math.random() * modKeys.length);
    //console.log('selectedMod', selectedMod);
    modPubKey = modKeys[selectedMod];
  } else {
    console.warn('no moderators configured, skipping moderation tests');
  }
  const adminApi = new adnServerAPI(disk_config.api.modKey, platform_admin_url);
  const res = await adminApi.serverRequest('tokens/@'+modPubKey, {});
  //console.log('token res', res);
  modToken = res.response.data.token;
  return modToken;
}

const harness200 = (options, nextTest) => {
  it("returns status code 200", (done) => {
    try {
      request(options, function(error, response, body) {
        if (!response) {
          console.error('harness200 no response', error);
          return done();
        }
        if (response && response.statusCode != 200) console.error('error body', body);
        assert.equal(200, response.statusCode);
        done();
        if (nextTest) nextTest(body);
      });
    } catch(e) {
      console.error('harness', e);
    }
  })
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

// test token endpoints
describe(`get challenge for ${ourPubKeyHex} /loki/v1/get_challenge`, () => {
  harness200({
    url: overlay_url + 'loki/v1/get_challenge?pubKey=' + ourPubKeyHex,
    json: true,
  }, async function(body) {
    // console.log('get challenge body', body);
    // body.cipherText64
    // body.serverPubKey64 // base64 encoded pubkey
    let tokenString
    try {
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
      //console.log('tokenString', tokenString);
    } catch(e) {
      console.error('crypto', e)
    }

    // this is clearly failing and not returning an error code...
    describe(`submit challenge for ${tokenString} /loki/v1/submit_challenge`, function() {
      harness200({
        method: 'POST',
        url: overlay_url + 'loki/v1/submit_challenge',
        form: {
          pubKey: ourPubKeyHex,
          token: tokenString,
        }
      }, function(body) {
        // body should be ''
        //console.log('submit challenge body', body);

        // test token endpoints
        describe("get user_info /loki/v1/user_info", () => {
          harness200({
            url: overlay_url + 'loki/v1/user_info?access_token=' + tokenString,
          }, function(body) {
            //console.log('get user_info body', body);
            // {"meta":{"code":200},"data":{
            // "user_id":10,"client_id":"messenger",
            //"scopes":"basic stream write_post follow messages update_profile files export",
            //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
          });
        });

        // well we need to create a new message
        // can't do it with overlay alone atm
        // so we need to configure api_url
        //console.log(disk_config.api.api_url + 'channels/1/messages');

        // might be a timing issue here where this test is sometimes skipped...

        selectModToken().then(modToken => {
          //console.log('modKey', modPubKey, 'modToken', modToken);
          if (!modToken) {
            console.error('No modToken, skipping moderation tests');
            return;
          }
          try {
            describe("create message /channels/1/messages", () => {
              // create a dummy message
              harness200({
                method: 'POST',
                url: disk_config.api.api_url + 'channels/1/messages',
                headers: {
                  'Authorization': 'Bearer ' + tokenString,
                  'Content-Type': 'application/json',
                },
                json: true,
                body: {
                  text: 'testing message',
                }
              }, function(body) {
                //console.log('create message', body);
                // test delete endpoint
                describe("modDelete message /loki/v1/moderation/message/" + body.data.id, ()  =>{
                  harness200({
                    method: 'DELETE',
                    url: overlay_url + 'loki/v1/moderation/message/' + body.data.id,
                    headers: {
                      'Authorization': 'Bearer ' + modToken
                    },
                  }, function(body) {
                    //console.log('modDelete message body', body);
                    // {"meta":{"code":200},"data":{
                    // "user_id":10,"client_id":"messenger",
                    //"scopes":"basic stream write_post follow messages update_profile files export",
                    //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
                  });
                });
              });
            });
          } catch(e) {
            console.error('exception error', e);
          }
        })
      });
    });
  });
});

describe("get deletes /loki/v1/channel/1/deletes", () => {
  harness200({
    url: overlay_url + 'loki/v1/channel/1/deletes',
  }, function(body) {
    // console.log('get deletes body', body);
    // {"meta":{"code":200,"min_id":0,"max_id":0,"more":false},"data":[]}
  });
})
