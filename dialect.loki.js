const express         = require('express');
const request         = require('request');
const bodyParser      = require('body-parser');
const Cookies         = require('cookies');
const multer          = require('multer');
const bb              = require('bytebuffer');
const libsignal       = require('libsignal');
const crypto          = require('crypto');

const app = express();
const router = express.Router();
const storage = multer.memoryStorage();
const tempDB = {};
const cache = require('../sapphire-platform-server/dataaccess.caminte.js');
const ADN_SCOPES = 'basic stream write_post follow messages update_profile files export';
const IV_LENGTH = 16;

const getTokenTimer = (pubKey, token) => {
  return setTimeout(() => {
    // 2 minute token timeout for temp db
    tempDB[pubKey] = tempDB[pubKey].filter(entry => {
      entry.token !== token;
    });
    if (tempDB[pubKey].length === 0) {
      delete tempDB[pubKey];
    }
  }, 120000);
}

const findOrCreateToken = async (pubKey) => {
  return new Promise((res, rej) => {
    findOrCreateUser(pubKey)
      .then(user => {
        cache.createOrFindUserToken(user.id, 'loki', ADN_SCOPES, (usertoken, tokenErr) => {
          if (tokenErr) {
            return rej(tokenErr);
          }
          // we don't need to validation application because there is only one application
          res(usertoken);
        })
      })
      .catch(e => {
        rej(e);
      });
  })
}

const findOrCreateUser = async (pubKey) => {
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

const confirmToken = async (pubKey, token) => {
  if (!tempDB[pubKey]) {
    return false;
  }
  // Check to ensure the token submitted has been sent to pubKey before
  let tokenFound = false;
  tempDB[pubKey] = tempDB[pubKey].filter(entry => {
    const thisTokenFound = entry.token === token;
    if (thisTokenFound) {
      clearTimeout(entry.timer);
      tokenFound = true;
    }
    return !thisTokenFound;
  });
  if (tempDB[pubKey].length === 0) {
    delete tempDB[pubKey];
  }
  if (tokenFound) {
    // TODO: Register token with platform?
    return true;
  }
  return false;
}

const getChallenge = async (pubKey) => {
  const serverKey = libsignal.curve.generateKeyPair();
  const serverPubKey64 = bb.wrap(serverKey.pubKey).toString('base64');

  const pubKeyData = Buffer.from(bb.wrap(pubKey, 'hex').toArrayBuffer());
  const symKey = libsignal.curve.calculateAgreement(
    pubKeyData,
    serverKey.privKey
  );

  const { token } = await findOrCreateToken(pubKey);
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

  if(!tempDB[pubKey]) {
    tempDB[pubKey] = [];
  }
  tempDB[pubKey].push({
    token,
    timer: getTokenTimer(pubKey, token),
  });

  return {
    cipherText64,
    serverPubKey64,
  };
}

/** need this for POST parsing */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.all('/*', (req, res, next) => {
  console.log('got request', req.path)
  res.start=new Date().getTime();
  origin = req.get('Origin') || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Content-Length');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization'); // add the list of headers your site allows.
  if (req.method === 'OPTIONS') {
    const ts = new Date().getTime();
    const diff = ts-res.start;
    if (diff > 100) {
      console.log('app.js - OPTIONS requests served in', (diff)+'ms', req.path);
    }
    return res.sendStatus(200);
  }
  next();
});

app.post('/loki/v1/submit_challenge', (req, res) => {
  const { pubKey, token } = req.body;
  if (!pubKey) {
    console.log('submit_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'pubKey missing',
    }));
    return;
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

app.get('/loki/v1/get_challenge', (req, res) => {
  const { pubKey } = req.query;
  if (!pubKey) {
    console.log('get_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'PubKey missing',
    }));
    return;
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

app.listen(8081);
