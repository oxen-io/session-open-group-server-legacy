const helpers = require('./dialect_tokens_helpers');

// all input / output filtering should happen here

let cache, dialect;
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic } = utilties);
  helpers.setup(utilties);
};

const getChallengeHandler = async (req, res) => {
  const { pubKey } = req.query;
  //console.log('dialect_tokens_handler::getChallengeHandler', pubKey)
  if (!pubKey) {
    console.log('get_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'PubKey missing',
    }));
    return;
  }

  const passes = await logic.passesWhitelist(pubKey);
  if (!passes) {
    console.log('get_challenge ', pubKey, 'not whitelisted');
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
  //console.log('dialect_tokens_handler::submitChallengeHandler', pubKey)
  if (!pubKey) {
    console.log('submit_challenge pubKey missing');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'pubKey missing',
    }));
    return;
  }

  const passes = await logic.passesWhitelist(pubKey);
  if (!passes) {
    console.log('submit_challenge ', pubKey, 'not whitelisted');
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
    res.status(200).end();
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
  // console.log('dialect_tokens_handler::getTokenInfoHandler')
  const usertoken = await dialect.validUser(req.token, res);
  if (usertoken === undefined) {
    // should have already been handled by dialect.validUser
    return;
  }
  //console.log('usertoken',  JSON.stringify(usertoken))
  let resObj = {}
  try {
    //console.log('dialect_tokens_handler::getTokenInfoHandler - getperms', usertoken.userid)
    // do we want server permissions?
    // or do we want a list of channel permissions?
    //const [err, perms] = await logic.getAllPermissionsByUserId(usertoken.userid);
    //console.log('dialect_tokens_handler::getTokenInfoHandler - got perms')
    //console.log('perms', perms)
    const modStatus = await config.getUserAccess(usertoken.userid);
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
    console.error('e', e);
  }
  return dialect.sendResponse(resObj, res);
};

module.exports = {
  setup,
  getChallengeHandler,
  submitChallengeHandler,
  getTokenInfoHandler
};
