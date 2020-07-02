let dispatcher

function setup(utilities) {
  //console.log('lib.dialect utilities dispatcher', utilities.dispatcher?true:false);
  ({ dispatcher } = utilities);
}

function sendResponse(json, resp) {
  const ts = new Date().getTime();
  const diff = ts-resp.start;
  if (diff > 1000) {
    // this could be to do the client's connection speed
    // how because we stop the clock before we send the response...
    console.log(`${resp.path} served in ${ts - resp.start}ms`);
  }
  if (json.meta && json.meta.code) {
    resp.status(json.meta.code);
  }
  if (resp.prettyPrint) {
    json=JSON.stringify(json,null,4);
  }
  resp.type('application/json');
  resp.setHeader("Access-Control-Allow-Origin", "*");
  resp.send(json);
}

function validUser(token, res, cb) {
  return new Promise(function(resolve, rej) {
    if (!token) {
      return resolve(false);
    }
    dispatcher.getUserClientByToken(token, (err, usertoken) => {
      if (err) {
        console.error('lib.dialect::validUser - getUserClientByToken err', err, 'token', token);
        const resObj={
          meta: {
            code: 500,
            error_message: err
          }
        };
        console.error('lib.dialect::validUser - error trying to verify token:', token);
        sendResponse(resObj, res);
        return resolve();
      }
      if (usertoken === null) {
        // could be they didn't log in through a server restart
        const resObj={
          meta: {
            code: 401,
            error_message: "Call requires authentication: Authentication required to fetch token."
          }
        };
        console.error('lib.dialect::validUser - token does not exist:', token);
        sendResponse(resObj, res);
        return resolve();
      }
      if (cb) cb(usertoken)
      resolve(usertoken)
    });
  });
}

module.exports = {
  setup,
  sendResponse,
  validUser
}
