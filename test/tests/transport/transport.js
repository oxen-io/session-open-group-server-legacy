const fs        = require('fs');
const crypto    = require('crypto');
const bb        = require('bytebuffer');
const libsignal = require('libsignal');
const assert    = require('assert');
const libloki_crypt = require('../../../dialects/transport/lib.loki_crypt');
const util       = require('util');
const textEncoder = new util.TextEncoder();

const IV_LENGTH = 16;

const OPEN_SERVER_PUB_KEY_FILE = 'proxy.pub'

// load local key
if (!fs.existsSync(OPEN_SERVER_PUB_KEY_FILE)) {
  console.log(OPEN_SERVER_PUB_KEY_FILE, 'is missing');
  process.exit(1);
}

// load into buffers
const OpenServerPubKey = fs.readFileSync(OPEN_SERVER_PUB_KEY_FILE);

// functions specific to test

// no proxy for open groups
/*
// PROXY
const testSecureRpc = async (payloadObj, testInfo) => {
  const payloadData = Buffer.from(
    bb.wrap(JSON.stringify(payloadObj)).toArrayBuffer()
  );
  // test token endpoints
  const ephemeralKey = libsignal.curve.generateKeyPair();

  // mix server pub key with our priv key
  const symKey = libsignal.curve.calculateAgreement(
    OpenServerPubKey, // server's pubkey
    ephemeralKey.privKey // our privkey
  );

  // make sym key
  const cipherText64 = await libloki_crypt.DHEncrypt64(symKey, payloadData);
  const result = await testInfo.overlayApi.serverRequest('loki/v1/secure_rpc', {
    method: 'POST',
    objBody: {
      cipherText64
    },
    // out headers
    headers: {
      'Content-Type': 'application/json',
      'x-loki-file-server-ephemeral-key': bb.wrap(ephemeralKey.pubKey).toString('base64'),
    },
  });
  assert.equal(200, result.statusCode);
  assert.ok(result.response);
  assert.ok(result.response.meta);
  assert.equal(200, result.response.meta.code);
  assert.ok(result.response.data);

  const ivAndCiphertextResponse = bb.wrap(result.response.data,'base64').toArrayBuffer();

  const riv = Buffer.from(ivAndCiphertextResponse.slice(0, IV_LENGTH));
  const rciphertext = Buffer.from(ivAndCiphertextResponse.slice(IV_LENGTH));

  const decrypted = await libsignal.crypto.decrypt(
    symKey,
    rciphertext,
    riv,
  );
  // not all results are json (/time /)
  const str = decrypted.toString();
  return str;
}
*/

// ONION
const testLsrpc = async (payloadObj, testInfo) => {
  const payloadData = textEncoder.encode(JSON.stringify(payloadObj));
  const ephemeralKey = libsignal.curve.generateKeyPair();
  const symKey = libloki_crypt.makeSymmetricKey(
    ephemeralKey.privKey, // our privkey
    OpenServerPubKey, // server's pubkey
  );
  const cipherTextBuf = libloki_crypt.encryptGCM(symKey, payloadData);
  const result = await testInfo.overlayApi.serverRequest('loki/v1/lsrpc', {
    method: 'POST',
    objBody: {
      ciphertext: bb.wrap(cipherTextBuf).toString('base64'),
      ephemeral_key: bb.wrap(ephemeralKey.pubKey).toString('hex')
    },
    noJson: true,
    // out headers
    headers: {
      'Content-Type': 'application/json',
    },
  });
  assert.equal(200, result.statusCode);
  assert.ok(result.response);
  const nonceCiphertextAndTag = Buffer.from(
    bb.wrap(result.response, 'base64').toArrayBuffer()
  );
  const decryptedJSON = libloki_crypt.decryptGCM(symKey, nonceCiphertextAndTag);
  const obj = JSON.parse(decryptedJSON)
  assert.equal(200, obj.status);
  return obj;
}

module.exports = (testInfo) => {
  it('server public key', async function() {
    // test token endpoints
    const result = await testInfo.overlayApi.serverRequest('loki/v1/public_key');
    assert.equal(200, result.statusCode);
    assert.ok(result.response);
    assert.ok(result.response.meta);
    assert.equal(200, result.response.meta.code);
    assert.ok(result.response.data); // 'BWJQnVm97sQE3Q1InB4Vuo+U/T1hmwHBv0ipkiv8tzEc'
  });

  // no proxy for open groups
  // these can be enabled and will pass
  // but I'd rather reflect responsibility of each subsystem/repo
  // then to tie unit tests to where they're located
  /*
  describe('proxy tests', function() {
    // no reason to test through a snode...
    it('secure rpc homepage', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: '',
        method: 'GET',
        headers: {},
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc time', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/time',
        method: 'GET',
        headers: {},
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc rss', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/rss/messenger',
        method: 'GET',
        headers: {},
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc get users by id', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'users?include_user_annotations=1&ids=@053b0ff9567a9ae0c2c62d5c37eb065b766e18d90e1c92c5a4a1ee1ba8d235b26e',
        method: 'GET',
        headers: {},
      };
      const json = await testSecureRpc(payloadObj, testInfo);
      assert.ok(json);
      const obj = JSON.parse(json);
      assert.ok(obj);
      assert.ok(obj.meta);
      assert.equal(200, obj.meta.code);
      assert.ok(obj.data);
    });
    // TODO:
    // patch users/me
    // file upload
    // token exchange...
    it('secure rpc get/submit challenge', async function() {
      const ephemeralKey = libsignal.curve.generateKeyPair();
      const getChalPayloadObj = {
        // I think this is a stream, we may need to collect it all?
        body: null,
        endpoint: "loki/v1/get_challenge?pubKey=" + ephemeralKey.pubKey.toString('hex'),
        method: "GET",
        headers: {},
      };
      const json = await testSecureRpc(getChalPayloadObj, testInfo);
      const response = JSON.parse(json);
      assert.ok(response.cipherText64);
      assert.ok(response.serverPubKey64);
      // test b64 decode?
      // that's why this next line kind of does...
      const symmetricKey = libsignal.curve.calculateAgreement(
        Buffer.from(response.serverPubKey64, 'base64'),
        ephemeralKey.privKey
      );
      const token = await libloki_crypt.DHDecrypt64(symmetricKey, response.cipherText64);
      const submitChalPayloadObj = {
        // I think this is a stream, we may need to collect it all?
        body: '{"pubKey":"' + ephemeralKey.pubKey.toString('hex') + '","token":"' + token + '"}',
        endpoint: "loki/v1/submit_challenge",
        method: "POST",
        headers: { 'content-type': 'application/json; charset=utf-8' },
      };
      // will auto test the response enough
      await testSecureRpc(submitChalPayloadObj, testInfo);
    });
    it('secure rpc missing header', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/time',
        method: 'GET',
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc missing body', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        method: 'GET',
        headers: {},
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc missing method', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        body: {}, // might need to b64 if binary...
        headers: {},
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
    it('secure rpc missing body & header', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        method: 'GET',
      };
      const str = await testSecureRpc(payloadObj, testInfo);
      assert.ok(str);
    });
  });
  */

  // FIXME: make one test change that we can swap out the transport...
  describe('onion request tests', function() {
    it('lsrpc homepage', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: '',
        method: 'GET',
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc time', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/time',
        method: 'GET',
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc rss', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/rss/messenger',
        method: 'GET',
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc get users by id', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'users?include_user_annotations=1&ids=@053b0ff9567a9ae0c2c62d5c37eb065b766e18d90e1c92c5a4a1ee1ba8d235b26e',
        method: 'GET',
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
      const obj = JSON.parse(resp.body);
      assert.ok(obj);
      assert.ok(obj.meta);
      assert.equal(200, obj.meta.code);
      assert.ok(obj.data);
    });
    it('lsrpc get/submit challenge', async function() {
      const ephemeralKey = libsignal.curve.generateKeyPair();
      const getChalPayloadObj = {
        // I think this is a stream, we may need to collect it all?
        body: null,
        endpoint: "loki/v1/get_challenge?pubKey=" + ephemeralKey.pubKey.toString('hex'),
        method: "GET",
        headers: {},
      };
      const resp = await testLsrpc(getChalPayloadObj, testInfo);
      const response = JSON.parse(resp.body);
      assert.ok(response.cipherText64);
      assert.ok(response.serverPubKey64);
      // test b64 decode?
      // that's why this next line kind of does...
      const symmetricKey = libsignal.curve.calculateAgreement(
        Buffer.from(response.serverPubKey64, 'base64'),
        ephemeralKey.privKey
      );
      const token = await libloki_crypt.DHDecrypt64(symmetricKey, response.cipherText64);
      const submitChalPayloadObj = {
        // I think this is a stream, we may need to collect it all?
        body: '{"pubKey":"' + ephemeralKey.pubKey.toString('hex') + '","token":"' + token + '"}',
        endpoint: "loki/v1/submit_challenge",
        method: "POST",
        headers: { 'content-type': 'application/json; charset=utf-8' },
      };
      // will auto test the response enough
      await testLsrpc(submitChalPayloadObj, testInfo);
    });
    it('lsrpc missing header', async function() {
      const payloadObj = {
        body: {}, // might need to b64 if binary...
        endpoint: 'loki/v1/time',
        method: 'GET',
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc missing body', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        method: 'GET',
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc missing method', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        body: {}, // might need to b64 if binary...
        headers: {},
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
    it('lsrpc missing body & header', async function() {
      const payloadObj = {
        endpoint: 'loki/v1/time',
        method: 'GET',
      };
      const resp = await testLsrpc(payloadObj, testInfo);
      assert.ok(resp.body);
    });
  });
}
