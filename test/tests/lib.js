const libsignal = require('libsignal');

const IV_LENGTH = 16;
const DHDecrypt = async (symmetricKey, ivAndCiphertext) => {
  const iv = ivAndCiphertext.slice(0, IV_LENGTH);
  const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
  return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
}

let overlayApi;

function get_challenge(ourPubKeyHex) {
  return new Promise(async (resolve, rej) => {
    let tokenString, result
    try {
      result = await overlayApi.serverRequest('loki/v1/get_challenge', {
        params: {
         pubKey: ourPubKeyHex
        }
      });
      resolve(result);
    } catch (e) {
      console.error('platformApi.serverRequest err', e, result)
      rej(e);
    }
  });
}

const decodeToken = async (ourKey, result) => {
  const body = result.response;
  // body.cipherText64
  // body.serverPubKey64 // base64 encoded pubkey

  const serverPubKeyBuff = Buffer.from(body.serverPubKey64, 'base64')
  const serverPubKeyHex = serverPubKeyBuff.toString('hex');

  const ivAndCiphertext = Buffer.from(body.cipherText64, 'base64');

  const symmetricKey = libsignal.curve.calculateAgreement(
    serverPubKeyBuff,
    ourKey.privKey
  );
  const token = await DHDecrypt(symmetricKey, ivAndCiphertext);
  tokenString = token.toString('utf8');
  // console.log('decodeToken::tokenString', tokenString)

  return tokenString;
}

const submit_challenge = (tokenString, pubKey) => {
  if (!tokenString) {
    console.trace('test:::lib:::submit_challenge - no tokenString passed')
    return;
  }
  // we use this promise to delay resolution
  return new Promise(async (resolve, rej) => {
    const result = await overlayApi.serverRequest('loki/v1/submit_challenge', {
      method: 'POST',
      objBody: {
        pubKey: pubKey,
        token: tokenString,
      },
      noJson: true
    });
    resolve(result);
  });
}

function setup(testInfo) {
  overlayApi = testInfo.overlayApi;
}

module.exports = {
  setup,
  get_challenge,
  decodeToken,
  submit_challenge,
}
