const fs = require('fs');
const path = require('path');
const nconf = require('nconf');
const request = require('request');
const assert = require('assert');
const ini = require('loki-launcher/ini');
const crypto = require('crypto');
const bb = require('bytebuffer');
const libsignal = require('libsignal');

// Look for a config file
const ini_bytes = fs.readFileSync('loki.ini');
disk_config = ini.iniToJSON(ini_bytes.toString());

//console.log('disk_config', disk_config)
const overlay_port = parseInt(disk_config.api.port) || 8080;
const overlay_url = 'http://localhost:' + overlay_port + '/';

const IV_LENGTH = 16;

/*
const config_path = path.join(__dirname, '/../../sapphire-platform-server/config.json');
console.log('config_path', config_path);
// and a model file
const config_model_path = path.join(__dirname, '/config.models.json');
nconf.argv().env('__').file({file: config_path}).file('model', {file: config_model_path});

let webport = nconf.get('web:port') || 7070;
const base_url = 'http://localhost:' + webport + '/'
console.log('read', base_url)
*/

const pubKey = '056abe9294d1eb87ca022813bc3db40102a30da4b34a4d5ca6dfb1d41c23601614';
const token = 'JxOcAARNt5wvpcC0eJMgqVNwRK5t9Ml1zUpF2hIrjscQrIgV2GYUQPlHI8Dpfoq3f3znvPkX79ZhEHVAeaoknJE8EEa5vsZb';

const harness200 = (options, nextTest) => {
  it("returns status code 200", (done) => {
    request(options, function(error, response, body) {
      assert.equal(200, response.statusCode)
      done()
      if (nextTest) nextTest(body)
    })
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
describe("get challenge /loki/v1/get_challenge", () => {
  harness200({
    url: overlay_url + 'loki/v1/get_challenge?pubKey=' + ourPubKeyHex,
    json: true,
  }, async function(body) {
    // console.log('get challenge body', body);
    // body.cipherText64
    // body.serverPubKey64 // base64 encoded pubkey

    // console.log('serverPubKey64', body.serverPubKey64);
    const serverPubKeyBuff = Buffer.from(body.serverPubKey64, 'base64')
    const serverPubKeyHex = serverPubKeyBuff.toString('hex');
    //console.log('serverPubKeyHex', serverPubKeyHex)

    const ivAndCiphertext = Buffer.from(body.cipherText64, 'base64')

    const symmetricKey = libsignal.curve.calculateAgreement(
      serverPubKeyBuff,
      ourKey.privKey
    );
    const token = await DHDecrypt(symmetricKey, ivAndCiphertext);
    const tokenString = token.toString('utf8');
    console.log('tokenString', tokenString);

    describe("submit challenge /loki/v1/submit_challenge", function() {
      harness200({
        method: 'POST',
        url: overlay_url + 'loki/v1/submit_challenge',
        form: {
          pubKey: ourPubKeyHex,
          token: tokenString,
        }
      }, function(body) {
        console.log('submit challenge body', body);
      });
    });
  });
});

// test token endpoints
describe("get user_info /loki/v1/user_info", () => {
  harness200({
    url: overlay_url + 'loki/v1/user_info?access_token=' + token,
  }, function(body) {
    //console.log('get user_info body', body);
    // {"meta":{"code":200},"data":{
    // "user_id":10,"client_id":"messenger",
    //"scopes":"basic stream write_post follow messages update_profile files export",
    //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
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

// test delete endpoint
describe("modDelete message /loki/v1/moderation/message/1", ()  =>{
  harness200({
    method: 'DELETE',
    url: overlay_url + 'loki/v1/moderation/message/1',
    headers: {
      'Authorization': 'Bearer ' + token
    },
  }, function(body) {
    // console.log('modDelete message body', body);
    // {"meta":{"code":200},"data":{
    // "user_id":10,"client_id":"messenger",
    //"scopes":"basic stream write_post follow messages update_profile files export",
    //"created_at":"2019-09-09T01:15:06.000Z","expires_at":"2019-09-09T02:15:06.000Z"}}
  });
});
