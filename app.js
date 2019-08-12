const express    = require('express');
const request    = require('request');
const bodyParser = require('body-parser');
const Cookies    = require('cookies');
const multer     = require('multer');

const app = express();
const router = express.Router();

const storage = multer.memoryStorage();

const NONCE_LEN = 30;
const tempDB = {};

const generateNonce = () => {
  let nonce = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < NONCE_LEN; i++) {
    nonce += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return nonce;
}

const saveToken = async (pubKey, token) => {
  // Temp function, hit db
  return;
}

const generateToken = async (pubKey) => {
  // Temp function, async to hit db
  let token = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < NONCE_LEN; i++) {
    token += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  await saveToken(pubKey, token);
  return token;
}

const getNonceTimer = (pubKey) => {
  setTimeout(() => {
    // 2 minute nonce timeout for temp db
    if (tempDB[pubKey]) {
      delete tempDB[pubKey];
    }
  }, 12000);
}

const getOrCreateNonce = (pubKey) => {
  if (!tempDB[pubKey]) {
    tempDB[pubKey] = {
      nonce: generateNonce(),
      timer: getNonceTimer(),
    }
    console.log(`New nonce: ${tempDB[pubKey].nonce}`);
  } else {
    clearTimeout(tempDB[pubKey].timer);
    tempDB[pubKey].timer = getNonceTimer();
    console.log(`Second nonce: ${tempDB[pubKey].nonce}`);
  }
  return tempDB[pubKey].nonce;
}

const validSignature = (pubKey, signature) => {
  const nonce = getOrCreateNonce(pubKey);
  // Check sig
  console.log(`Signature valid: ${signature}`);
  return true;
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

app.post('/loki/v1/startRegistration', (req, res) => {
  const { pubKey } = req.body;
  if (!pubKey) {
    console.log('startRegistration arguments missing');
    res.status(422).end('PubKey missing');
  }
  const nonce = getOrCreateNonce(pubKey);
  res.status(200).type('application/json').end(JSON.stringify({ nonce }));
});

app.post('/loki/v1/submitRegistration', async (req, res) => {
  const { pubKey, signature } = req.body;
  if (!pubKey || !signature) {
    console.log('submitRegistration arguments missing');
    res.status(422).end('Arguments missing');
    return;
  }
  if (!validSignature(pubKey, signature)) {
    const nonce = generateNonce(pubKey);
    res.status(401).type('application/json').end(JSON.stringify({ nonce }));
    return;
  }
  const token = await generateToken(pubKey);
  res.status(200).type('application/json').end(JSON.stringify({ token }));
});

app.use((req, res, next) => {
  req.cookies = new Cookies(req, res);
  res.path = req.path;
  console.log(res.path);
  console.log(`Request received: ${res.path}`);
  next();
});

app.listen(8081);
