const fs         = require('fs');
const path       = require('path');
const nconf      = require('nconf');
const express    = require('express');
const bodyParser = require('body-parser');
const config     = require('./config');

const app = express();

// Look for a config file
const disk_config = config.getDiskConfig();

const overlay_port = parseInt(disk_config.api && disk_config.api.port) || 8080;

const config_path = path.join('./server/config.json');
nconf.argv().env('__').file({file: config_path});

const platform_api_url = disk_config.api && disk_config.api.api_url || 'http://localhost:7070/';
const platform_admin_url = disk_config.api && disk_config.api.admin_url.replace(/\/$/, '') || 'http://localhost:3000/';

console.log('platform_api_url', platform_api_url);
console.log('platform_admin_url', platform_admin_url);

// configure the admin interface for use
// can be easily swapped out later
const proxyAdmin = require('./server/dataaccess.proxy-admin');
// fake dispatcher that only implements what we need
proxyAdmin.dispatcher = {
  // ignore local user updates
  updateUser: (user, ts, cb) => { cb(user); },
  // ignore local message updates
  setMessage: (message, cb) => { if (cb) cb(message); },
  setChannel: (channel, ts, cb) => { if (cb) cb(channel); },
}
// backward compatible
if (proxyAdmin.start) {
  proxyAdmin.start(nconf);
}
proxyAdmin.apiroot = platform_api_url;
if (proxyAdmin.apiroot.replace) {
  proxyAdmin.apiroot = proxyAdmin.apiroot.replace(/\/$/, '');
}
proxyAdmin.adminroot = platform_admin_url;
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

// preflight checks
dataAccess.getChannel(1, (chnl, err, meta) => {
  if (err) console.error('channel 1 get err', err);
  if (chnl && chnl.id) {
    return;
  }
  console.log('need to create channel 1!');
  dataAccess.getUser(1, async (user, err2, meta2) => {
    if (err2) console.error('get user 1 err', err2);
    // if no user, create the user...
    console.log('user', user);
    if (!user || !user.length) {
      console.log('need to create user 1!');
      user = await new Promise((resolve, rej) => {
        dataAccess.addUser('root', '', function(user, err4, meta4) {
          if (err4) console.error('add user 1 err', err4);
          resolve(user);
        });
      });
      console.log('user', user.id, 'created!');
    }
    // no channel, so we need to create this public channel
    dataAccess.addChannel(1, {
      type: 'network.loki.messenger.chat.public',
      reader: 0,
      writer: 1,
      readedit: 1,
      writeedit: 1,
      editedit: 1,
      readers: [],
      writers: [],
      editors: [],
    }, (chnl, err3, meta3) => {
      if (err3) console.error('addChannel err', err3);
      if (chnl && chnl.id) {
        console.log('channel', chnl.id, 'created');
      }
    });
  });
});

app.listen(overlay_port);
