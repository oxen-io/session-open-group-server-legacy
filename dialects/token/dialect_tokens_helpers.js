const fs        = require('fs');
const crypto    = require('crypto');
const bb        = require('bytebuffer');
const libsignal = require('libsignal');

const SESSION_TTL_MSECS = 120 * 1000; // 2 minutes
const TOKEN_TTL_MINS = 0; // 0 means don't expire

const ADN_SCOPES = 'basic stream write_post follow messages update_profile files export';
const IV_LENGTH = 16;

// setup will set this
let config, cache, dispatcher;

const setup = (utilties) => {
  // logic, dialect are also available here
  ({ config, cache, dispatcher } = utilties);
}

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
  if (tempDB[pubKey] === undefined) return;
  for(const i in tempDB[pubKey]) {
    const currentToken = tempDB[pubKey][i];
    if (currentToken.token === token) {
      // remove it by index
      if (currentToken.timer) clearTimeout(currentToken.timer);
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
  for(const pubKey in tempDB) {
    const found = tempDB[pubKey].find(tempObjs => {
      const tempToken = tempObjs.token;
      if (tempToken === token) return true;
    })
    if (found) {
      return true;
    }
  }
  return false;
}

const getTempTokenList = () => {
  return Object.keys(tempDB).map(pubKey => {
    return tempDB[pubKey].map(tempObj => {
      return tempObj.token;
    });
  });
}
//
// end tempdb abstraction layer
//

const tempdbWrapper = {
  addTempStorage,
  checkTempStorageForToken,
  getTempTokenList,
}

// verify a token is not in use
const findToken = (token) => {
  return new Promise((res, rej) => {
    // if not found in temp storage
    if (checkTempStorageForToken(token)) {
      return res(true);
    }
    // check database
    cache.getAPIUserToken(token, (usertoken, err) => {
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
        res(token);
      })
      .catch(e => {
        rej(e);
      });
  });
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
            console.error('addUser err', err2);
            rej(err2);
          } else {
            res(newUser);
          }
        })
      } else {
        // we have this user
        res(user);
      }
    });
  });
}

const getChallenge = async (pubKey) => {
  // make our local keypair
  const serverKey = libsignal.curve.generateKeyPair();
  // encode server's pubKey in base64
  const serverPubKey64 = bb.wrap(serverKey.pubKey).toString('base64');

  // convert our hex pubKey into binary buffer
  const pubKeyData = Buffer.from(bb.wrap(pubKey, 'hex').toArrayBuffer());

  // mix client pub key with server priv key
  const symKey = libsignal.curve.calculateAgreement(
    pubKeyData,
    serverKey.privKey
  );

  // acquire token
  const token = await createToken(pubKey);
  addTempStorage(pubKey, token);

  // convert our ascii token to binary buffer
  const tokenData = Buffer.from(bb.wrap(token).toArrayBuffer());

  // some randomness
  const iv = crypto.randomBytes(IV_LENGTH);
  const iv64 = bb.wrap(iv).toString('base64');

  // encrypt tokenData with symmetric Key using iv
  const ciphertext = await libsignal.crypto.encrypt(
    symKey,
    tokenData,
    iv
  );

  // make final buffer for cipherText
  const ivAndCiphertext = new Uint8Array(
    iv.byteLength + ciphertext.byteLength
  );
  // add iv
  ivAndCiphertext.set(new Uint8Array(iv));
  // add ciphertext after iv position
  ivAndCiphertext.set(new Uint8Array(ciphertext), iv.byteLength);

  // convert final buffer to base64
  const cipherText64 = bb.wrap(ivAndCiphertext).toString('base64');

  return {
    cipherText64,
    serverPubKey64,
  };
}

const claimToken = (pubKey, token) => {
  return new Promise(async (res, rej) => {
    // Token has been recently generated
    // finally ensure user for pubKey
    const userObj = await findOrCreateUser(pubKey);
    if (!userObj) {
      return rej('user');
    }
    // promote token to usable for user
    cache.addUnconstrainedAPIUserToken(userObj.id, 'messenger', ADN_SCOPES, token, TOKEN_TTL_MINS, (tokenObj, err) => {
      if (err) {
        // we'll keep the token in the temp storage, so they can retry
        return rej('tokenCreation');
      }
      // return success
      res(true);
    });
  });
}

// getChallenge only sends token encrypted
// so if we guess a pubKey's token that we've generated, we grant access
const confirmToken = (pubKey, token) => {
  return new Promise(async (resolve, rej) => {
    // Check to ensure the token submitted has been generated in the last 2 minutes
    if (!checkTempStorageForToken(token)) {
      console.log('token', token, 'not in', getTempTokenList());
      return rej('invalid');
    }
    const res = await claimToken(pubKey, token);
    if (!res) {
      return rej('cant claim');
    }
    // if no, err we assume everything is fine...
    // ok token is now registered
    // remove from temp storage
    deleteTempStorageForToken(pubKey, token);
    resolve(true);
  });
}

module.exports = {
  setup,
  getChallenge,
  createToken,
  claimToken,
  confirmToken
}
