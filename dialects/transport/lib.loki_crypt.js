const crypto    = require('crypto');
const libsignal = require('libsignal');
const bb        = require('bytebuffer');

/*
bufferFrom64
bufferTo64
bufferFromHex
bufferToHex
*/

const IV_LENGTH = 16;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

async function DHEncrypt(symmetricKey, plainText) {
  const iv = libsignal.crypto.getRandomBytes(IV_LENGTH);
  const ciphertext = await libsignal.crypto.encrypt(
    symmetricKey,
    plainText,
    iv
  );
  const ivAndCiphertext = new Uint8Array(
    iv.byteLength + ciphertext.byteLength
  );
  ivAndCiphertext.set(new Uint8Array(iv));
  ivAndCiphertext.set(new Uint8Array(ciphertext), iv.byteLength);
  return ivAndCiphertext;
}

async function DHDecrypt(symmetricKey, ivAndCiphertext) {
  const iv = ivAndCiphertext.slice(0, IV_LENGTH);
  const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
  return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
}

// used for proxy requests
const DHEncrypt64 = async (symmetricKey, plainText) => {
  // generate an iv (web-friendly)
  const iv = crypto.randomBytes(IV_LENGTH);
  // encrypt plainText
  const ciphertext = await libsignal.crypto.encrypt(
    symmetricKey,
    plainText,
    iv
  );
  // create buffer
  const ivAndCiphertext = new Uint8Array(
    iv.byteLength + ciphertext.byteLength
  );
  // copy iv into buffer
  ivAndCiphertext.set(new Uint8Array(iv));
  // copy ciphertext into buffer
  ivAndCiphertext.set(new Uint8Array(ciphertext), iv.byteLength);
  // base64 encode
  return bb.wrap(ivAndCiphertext).toString('base64');
}

// used for tokens
const DHDecrypt64 = async (symmetricKey, cipherText64) => {
  // base64 decode
  const ivAndCiphertext = Buffer.from(
    bb.wrap(cipherText64, 'base64').toArrayBuffer()
  );
  // extract iv
  const iv = ivAndCiphertext.slice(0, IV_LENGTH);
  // extract ciphertext
  const ciphertext = ivAndCiphertext.slice(IV_LENGTH);
  // decode plaintext
  return libsignal.crypto.decrypt(symmetricKey, ciphertext, iv);
}

function makeSymmetricKey(privKey, pubKey) {
  const keyAgreement = libsignal.curve.calculateAgreement(
    pubKey,
    privKey,
  );
  //console.log('makeSymmetricKey agreement', keyAgreement.toString('hex'))

  // hash the key agreement
  const hashedSymmetricKeyBuf = crypto.createHmac('sha256', 'LOKI').update(keyAgreement).digest()

  return hashedSymmetricKeyBuf;
}

function encryptGCM(symmetricKey, plaintextEnc) {
  // not on the node side
  //const nonce = libsignal.crypto.getRandomBytes(NONCE_LENGTH);
  const nonce = crypto.randomBytes(NONCE_LENGTH); // Buffer (object)

  const cipher = crypto.createCipheriv('aes-256-gcm', symmetricKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintextEnc), cipher.final()]);
  const tag = cipher.getAuthTag()

  const finalBuf = Buffer.concat([nonce, ciphertext, tag]);
  return finalBuf;
}

function decryptGCM(symmetricKey, ivCiphertextAndTag) {
  const nonce      = ivCiphertextAndTag.slice(0, NONCE_LENGTH);
  const ciphertext = ivCiphertextAndTag.slice(NONCE_LENGTH, ivCiphertextAndTag.byteLength - TAG_LENGTH);
  const tag        = ivCiphertextAndTag.slice(ivCiphertextAndTag.byteLength - TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', symmetricKey, nonce);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext, 'binary', 'utf8') + decipher.final();
}

module.exports = {
  DHEncrypt,
  DHDecrypt,
  DHEncrypt64,
  DHDecrypt64,
  makeSymmetricKey,
  encryptGCM,
  decryptGCM,
}
