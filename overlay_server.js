const path       = require('path');
const nconf      = require('nconf');
const express    = require('express');
const bodyParser = require('body-parser');

const app = express();

const tempDB = {};
const config_path = path.join('../sapphire-platform-server/config.json');
nconf.argv().env('__').file({file: config_path});

const cache = require('../sapphire-platform-server/dataaccess.caminte.js');
cache.start(nconf);

/** need this for POST parsing */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.all('/*', (req, res, next) => {
  console.log('got request', req.path);
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
      console.log('overlay_server.js - OPTIONS requests served in', (diff)+'ms', req.path);
    }
    return res.sendStatus(200);
  }
  next();
});

// create a fake dispatcher
app.dispatcher={
  cache: cache
};
const lokiDialectMount = require('./dialect.loki');
lokiDialectMount(app, '');

app.listen(8081);
