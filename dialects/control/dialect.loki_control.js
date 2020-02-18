// global/general loki overlay setup/config
const overlay  = require('../../lib.overlay');

// will need to upgrade to regexs when we support multiple channels...
const allowedEndpoints = {
  get: [
    // '/token', // used for ??
    '/channels/1',
    '/channels/1/messages',
  ],
  post: [
    '/channels/1/messages',
  ],
  put: [
    '/users/me',
    '/channels/1',
  ],
  patch: [
    '/users/me'
  ],
  delete: [
  ],
}

// block
// - posts endpoints
// - user search (so you can't enumerate pubkeys)
// require token on user lookup

// if whitelist mode
// - we block tokens that aren't whitelisted
// - block everything not allowed...

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilities = overlay.setup(cache, app.dispatcher);
  utilities.cache = cache;
  utilities.dispatcher = app.dispatcher;
  utilities.nconf = app.nconf;

  app.use(function (req, res, next) {
    // allow *_challenge
    if (req.path === '/loki/v1/get_challenge' ||
        req.path === '/loki/v1/submit_challenge') {
      return next();
    }
    // allow access to pomf files...
    if (req.path.match(/^\/f\//)) {
      return next();
    }
    // disable posts system completely
    if (req.path.match(/^\/posts/i)) {
      console.log('loki control posts request?', req.path);
      return res.status(403).type('application/json').end(JSON.stringify({
        meta: {
          code: 403,
          error: 'Forbidden',
        },
        data: false
      }));
    }
    // don't have to worry about the querystring
    if (req.path === '/users/search') {
      console.log('loki control user search request?', req.path);
      return res.status(403).type('application/json').end(JSON.stringify({
        meta: {
          code: 403,
          error: 'Forbidden',
        },
        data: false
      }));
    }
    // require a token for all /users requests
    if (req.path.match(/^\/users\//i) && !req.token) {
      // mainly for /users/{user_id}
      console.log('loki control user lookup required token now', req.path);
      // FIXME: proper message
      return res.status(401).type('application/json').end(JSON.stringify({
        meta: {
          code: 401,
          error: 'Need token',
        },
        data: false
      }));
    }

    const diskConfig = utilities.config.getDiskConfig();
    if (!diskConfig.whitelist) {
      return next();
    }
    // whitelist mode, hide some paths...
    if (!allowedEndpoints[req.method.toLowerCase()]) {
      console.log('method is not configured', req.method);
      return res.status(405).type('application/json').end(JSON.stringify({
        meta: {
          code: 405,
          error: 'Method Not Allowed',
        },
        data: false
      }));
    }
    let ok = true;
    // check non-dynamic
    if (!allowedEndpoints[req.method.toLowerCase()].includes(req.path.toLowerCase())) {
      ok = false;
    }

    // allow user look ups (but with a token, that check is done later)
    if (req.method.toLowerCase() === 'get' && req.path.match(/^\/users\//i)) {
      ok = true;
    }

    // all loki endpoints are valid
    if (req.path.match(/^\/loki\/v/)) {
      ok = true;
    }

    // check dynamic
    /*
    if (req.method.toLowerCase() === 'post') {
    } else if (req.method.toLowerCase() === 'put') {
    } else if (req.method.toLowerCase() === 'delete') {
    }
    */
    if (!ok) {
      console.log('control middleware blocking', req.method.toLowerCase(), req.path.toLowerCase());
      return res.status(403).type('application/json').end(JSON.stringify({
        meta: {
          code: 403,
          error: 'Forbidden',
        },
        data: false
      }));
    }
    if (!req.token) {
      console.log('weird session clients always have a token set', req.path);
      next();
    }
    // if valid URL
    if (req.token) {
      // get pubKey from token...
      cache.getAPIUserToken(req.token, async function(usertoken, err) {
        if (err) {
          console.error('control middleware getAPIUserToken err', err);
        }
        // usertoken.userid is now
        if (!usertoken || !usertoken.userid) {
          console.warn('control middleware no user or invalid token', req.token);
          return res.status(403).type('application/json').end(JSON.stringify({
            error: 'Forbidden',
          }));
        }
        const passes = await logic.passesWhitelistByUserID(usertoken.userid);
        if (!passes) {
          console.log('control middleware', usertoken.userid, 'not whitelisted');
          return res.status(403).type('application/json').end(JSON.stringify({
            error: 'Forbidden',
          }));
        }
        next();
      });
    }
  });

}
