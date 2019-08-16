const express         = require('express');
const request         = require('request');
const bodyParser      = require('body-parser');
const Cookies         = require('cookies');
const multer          = require('multer');
const sodium          = require('libsodium-wrappers');
const bb              = require('bytebuffer');

const app = express();
const router = express.Router();

const storage = multer.memoryStorage();

const tempDB = {};

const generateToken = (pubKey) => {
  // Temp function
  const TOKEN_LEN = 24;
  let token = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < TOKEN_LEN; i++) {
    token += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  saveToken(pubKey, token);
  return token;
}

const saveToken = (pubKey, token) => {
  // Temp function, hit db
  return;
}

const getEncryptedToken = (clientPubKey) => {
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  const serverPubKey64 = bb.wrap(publicKey).toString('base64');

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const nonce64 = bb.wrap(nonce).toString('base64');

  const token = generateToken(clientPubKey);
  const tokenData = sodium.from_string(token);

  const clientPubKeyData = sodium.from_hex(clientPubKey).slice(1); // Remove messenger leading 05

  const cipherText = sodium.crypto_box_easy(tokenData, nonce, clientPubKeyData, privateKey);
  const cipherText64 = bb.wrap(cipherText).toString('base64');

  return {
    cipherText64,
    nonce64,
    serverPubKey64,
  };
}

/** need this for POST parsing */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.all('/*', (req, res, next) => {
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

app.post('/loki/v1/getToken', (req, res) => {
  const { pubKey } = req.body;
  if (!pubKey) {
    console.log('getToken pubKey missing');
    res.status(422).end('PubKey missing');
    return;
  }
  const responseBody = getEncryptedToken(pubKey);
  res.status(200).type('application/json').end(JSON.stringify(responseBody));
});

app.listen(8081);
