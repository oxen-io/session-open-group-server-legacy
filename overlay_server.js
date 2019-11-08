const fs         = require('fs');
const path       = require('path');
const nconf      = require('nconf');
const express    = require('express');
const bodyParser = require('body-parser');
const config     = require('./config');

const app = express();

// Look for a config file
const disk_config = config.getDiskConfig();

const overlay_port = parseInt(disk_config.api.port) || 8080;

const config_path = path.join('./server/config.json');
nconf.argv().env('__').file({file: config_path});

// configure the admin interface for use
// can be easily swapped out later
const proxyAdmin = require('./server/dataaccess.proxy-admin');
// fake dispatcher that only implements what we need
proxyAdmin.dispatcher = {
  // ignore local user updates
  updateUser: (user, ts, cb) => { cb(user); },
  // ignore local message updates
  setMessage: (message, cb) => { if (cb) cb(message); },
}
// backward compatible
if (proxyAdmin.start) {
  proxyAdmin.start(nconf);
}
proxyAdmin.apiroot = disk_config.api.api_url;
if (proxyAdmin.apiroot.replace) {
  proxyAdmin.apiroot = proxyAdmin.apiroot.replace(/\/$/, '');
}
proxyAdmin.adminroot = disk_config.api.admin_url;
if (proxyAdmin.adminroot.replace) {
  proxyAdmin.adminroot = proxyAdmin.adminroot.replace(/\/$/, '');
}

const dataAccess = proxyAdmin;

// need this for POST parsing
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.all('/*', (req, res, next) => {
  console.log('got request', req.path);
  res.start = new Date().getTime();
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

  // set req.token
  if (req.query.access_token) {
    // passed by querystring
    req.token = req.query.access_token;
    if (typeof(req.token) === 'object') {
      req.token = req.token.filter(function (x, i, a) {
        return a.indexOf(x) === i;
      });
      if (req.token.length === 1) {
        console.warn('reduced multiple similar access_token params')
        req.token = req.token[0] // deArray it
      } else {
        console.log('multiple access_tokens?!? unique list: ', req.token)
      }
    }
  } else {
    // passed by header
    if (req.get('Authorization')) {
      req.token = req.get('Authorization').replace('Bearer ', '');
    }
  }

  // set up paging parameters
  const pageParams = {};
  pageParams.since_id = false;
  if (req.query.since_id) {
    pageParams.since_id = parseInt(req.query.since_id);
  }
  pageParams.before_id=false;
  if (req.query.before_id) {
    pageParams.before_id = parseInt(req.query.before_id);
  }
  pageParams.count=20;
  if (req.query.count) {
    pageParams.count = Math.min(Math.max(req.query.count, -200), 200);
  }
  // stream marker supported endpoints only
  pageParams.last_read = false;
  pageParams.last_read_inclusive = false;
  pageParams.last_marker = false;
  pageParams.last_marker_inclusive = false;

  // put objects into request
  req.apiParams = {
    pageParams: pageParams,
    token: req.token,
  }

  // configure response
  res.prettyPrint = req.get('X-ADN-Pretty-JSON') || 0;
  // non-ADN spec, ryantharp hack
  if (req.query.prettyPrint) {
    res.prettyPrint = 1;
  }

  next();
});

// create a fake dispatcher
app.dispatcher={
  cache: dataAccess,
  name: 'overlayStub',
  getUserClientByToken: function(token, cb) {
    dataAccess.getAPIUserToken(token, cb);
  }
};
const lokiDialectMountToken = require('./dialects/token/dialect.loki_tokens');
lokiDialectMountToken(app, '');
const lokiDialectMountModeration = require('./dialects/moderation/dialect.loki_moderation');
lokiDialectMountModeration(app, '');
// const modDialectMount = require('./dialect.webModerator');
// modDialectMount(app, '');

app.listen(overlay_port);
