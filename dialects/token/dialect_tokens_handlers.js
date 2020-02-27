const helpers = require('./dialect_tokens_helpers');

// all input / output filtering should happen here

let cache, dialect, config;
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic, config, overlay } = utilties);
  helpers.setup(utilties);
};

const getChallengeHandler = async (req, res) => {
  const { pubKey } = req.query;
  if (!pubKey) {
    console.log('get_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'PubKey missing',
    }));
    return;
  }

  const passes = await logic.passesWhitelist(pubKey);
  if (!passes) {
    console.log('getChallengeHandler', pubKey, 'not whitelisted');
    return res.status(401).type('application/json').end(JSON.stringify({
      error: 'not allowed',
    }));
  }

  helpers.getChallenge(pubKey).then(keyInfo => {
    res.status(200).type('application/json').end(JSON.stringify(keyInfo));
  }).catch(err => {
    console.log(`Error getting challenge: ${err}`);
    res.status(500).type('application/json').end(JSON.stringify({
      error: err.toString(),
    }));
    return;
  });
};

const submitChallengeHandler = async (req, res) => {
  const { pubKey, token } = req.body;
  if (!pubKey) {
    console.log('submit_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'pubKey missing',
    }));
    return;
  }

  const passes = await logic.passesWhitelist(pubKey);
  if (!passes) {
    console.log('submitChallengeHandler', pubKey, 'not whitelisted');
    return res.status(401).type('application/json').end(JSON.stringify({
      error: 'not allowed',
    }));
  }
  if (!token) {
    console.log('submit_challenge token missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'token missing',
    }));
    return;
  }
  helpers.confirmToken(pubKey, token).then(confirmation => {
    // confirmation should be true
    if (confirmation === true) {
      // refresh mods, to reduce wait time for an INI reload
      config.updateUserAccess();
      res.status(200).end();
    } else {
      res.status(500).end();
    }
  }).catch(err => {
    console.log(`Error confirming challenge: ${err}`);
    // handle errors we know
    if (err == 'invalid') {
      res.status(401).end();
    } else {
      res.status(500).end();
    }
  });
};

const getTokenInfoHandler = async (req, res) => {
  const usertoken = await dialect.validUser(req.token, res);
  if (usertoken === undefined) {
    // should have already been handled by dialect.validUser
    return;
  }

  // deny if not on whitelist...
  const passes = await logic.passesWhitelistByUserID(usertoken.userid);
  if (!passes) {
    console.log('getTokenInfoHandler', usertoken.userid, 'not whitelisted');
    // FIXME: if token exists, we should delete it...
    return res.status(401).type('application/json').end(JSON.stringify({
      error: 'not allowed',
    }));
  }

  let resObj = {}
  try {
    const modStatus = await overlay.getUserAccess(usertoken.userid);
    resObj={
      meta: {
        code: 200,
      },
      data: {
        user_id: usertoken.userid,
        client_id: usertoken.client_id,
        scopes: usertoken.scopes,
        created_at: usertoken.created_at,
        expires_at: usertoken.expires_at,
        moderator_status: modStatus,
      }
    };
  } catch (e) {
    console.error('dialect_tokens_handlers::getTokenInfoHandler e', e);
    resObj.meta.error_message = e;
  }
  return dialect.sendResponse(resObj, res);
};

module.exports = {
  setup,
  getChallengeHandler,
  submitChallengeHandler,
  getTokenInfoHandler
};
