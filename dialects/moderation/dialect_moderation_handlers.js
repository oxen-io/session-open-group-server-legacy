const helpers = require('./dialect_moderation_helpers');
const adnServerAPI = require('../../fetchWrapper');
const token_helpers = require('../token/dialect_tokens_helpers');

// all input / output filtering should happen here

let cache, dialect, logic, storage, platformApi;
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic, storage } = utilties);
  helpers.setup(utilties);
  token_helpers.setup(utilties);
  const disk_config = config.getDiskConfig();
  const nconf = utilties.nconf;
  const webport = nconf.get('web:port') || 7070;
  const webbind = nconf.get('web:listen') || '127.0.0.1';
  const webclient = webbind !== '0.0.0.0' ? webbind : '127.0.0.1';
  const base_url = 'http://' + webclient + ':' + webport + '/';

  const platform_api_url = disk_config.api && disk_config.api.api_url || base_url;
  platformApi = new adnServerAPI(platform_api_url);
};

const getChannelModeratorsHandler = async (req, res) => {
  const channelId = parseInt(req.params.id);
  if (isNaN(channelId)) {
    console.warn('id is not a number');
    return res.status(400).type('application/json').end(JSON.stringify({
      error: 'id not a valid number',
    }));
  }
  const roles = {
    moderators: [],
  };

  let userids;
  try {
    userids = await logic.getModeratorsByChannelId(channelId);
  } catch(e) {
    console.error(`Error getModeratorsByChannelId ${e}`);
    return res.status(500).type('application/json').end(JSON.stringify(roles));
  }

  if (userids.length) {
    try {
      const userAdnObjects = await helpers.getUsers(userids);
      roles.moderators = userAdnObjects.map(obj => {
        return obj.username;
      });
    } catch(e) {
      console.error(`Error getting users ${userids} ${e}`);
      return res.status(500).type('application/json').end(JSON.stringify(roles));
    }
  }
  res.status(200).type('application/json').end(JSON.stringify(roles));
};

const moderatorUpdateChannel = async (req, res) => {
  const channelId = parseInt(req.params.id);
  if (isNaN(channelId)) {
    console.warn('id is not a number');
    return res.status(400).type('application/json').end(JSON.stringify({
      error: 'id not a valid number',
    }));
  }
  helpers.validGlobal(req.token, res, (usertoken, access_list) => {
    // console.log('body', req.body)
    cache.getChannel(channelId, {} , function(channel, err) {
      if (err) console.error(err);
      if (channel === null) {
        return res.status(500).type('application/json').end(JSON.stringify({
          error: err,
          stub: 'channel_is_null',
        }));
      }
      cache.getUser(channel.ownerid, function(user, err) {
        if (err) console.error('moderatorUpdateChannel getUser err', err);
        const username = user.username;
        cache.getAPITokenByUsername(username, async function(token, err) {
          if (err) console.error('moderatorUpdateChannel getAPITokenByUsername err', err);

          const applyUpdate = async (token) => {
            // now place a normal request to the platform...
            const oldToken = platformApi.token;
            platformApi.token = token;
            // FIXME: why aren't we using cache here?
            // dispatcher updateChannel: gets and then applys changes and .save()s
            console.log('platformApi request to PUT channels/')
            const result = await platformApi.serverRequest(`channels/${channelId}`, {
              method: 'PUT',
              objBody: req.body
            });
            console.log('result', JSON.stringify(result));
            platformApi.token = oldToken;
            res.status(result.statusCode).type('application/json').end(JSON.stringify(result));
          }

          if (token !== null) {
            return applyUpdate(token.token);
          }
          // we don't yet have a token for that user, so create it
          // find an available token
          const newToken = await token_helpers.createToken(username);
          if (!newToken) {
            console.error('cant generate token, how is this possible?');
            return res.status(500).type('application/json').end(JSON.stringify({
              error: err,
              stub: 'channel_is_null',
            }));
          }
          // claim token (make it work)
          const confirmed = await token_helpers.claimToken(username, newToken);
          if (!confirmed) {
            console.error('cant confirm token');
            return res.status(500).type('application/json').end(JSON.stringify({
              error: err,
              stub: 'channel_is_null',
            }));
          }
          applyUpdate(newToken);
        });
      });
    });
  });
}

const getDeletesHandler = (req, res) => {
  const numId = parseInt(req.params.id);
  cache.getChannelDeletions(numId, req.apiParams, (interactions, err, meta) => {
    const items = interactions.map(interaction => ({
      delete_at: interaction.datetime,
      message_id: interaction.typeid,
      id: interaction.id
    }));
    const resObj={
      meta: meta,
      data: items
    };
    return dialect.sendResponse(resObj, res);
  })
};

const deleteMultipleHandler = (req, res) => {
  if (!req.query.ids) {
    console.warn('dialect_moderation_handler::deleteMultipleHandler - user message mass delete ids empty');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'ids missing',
    }));
    return;
  }
  const ids = req.query.ids.split(',');
  if (ids.length > 200) {
    console.warn('dialect_moderation_handler::deleteMultipleHandler - user message mass delete too many ids, 200<', ids.length);
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'too many ids',
    }));
    return;
  }
  dialect.validUser(req.token, res, async usertoken => {
    const [ code, err, messages ] = await helpers.getMessages(ids);
    if (err) {
      console.error('dialect_moderation_handler::deleteMultipleHandler - getMessages err', err)
      const resObj = {
        meta: {
          code,
          request: ids,
          err
        },
        data: messages
      };
      return dialect.sendResponse(resObj, res);
    }
    const metas = [];
    const datas = [];
    await Promise.all(messages.map(async (msg) => {
      // check our permission
      // msg will be the db format
      if (!msg || !msg.userid) {
        // not even on the list
        console.warn('no message or user object', JSON.stringify(msg));
        const resObj={
          meta: {
            code: 500,
            error_message: "No message or user object"
          },
        };
        metas.push(resObj.meta);
        datas.push(msg);
        return;
      }
      if (msg.userid !== usertoken.userid) {
        // not even on the list
        console.warn('user', usertoken.userid, 'tried to delete users', msg.userid, 'message', msg.id);
        const resObj={
          meta: {
            code: 403,
            error_message: "Your token does not have permission to delete this resource"
          },
        };
        metas.push(resObj.meta);
        datas.push(msg);
        return;
      }

      // we're allowed to nuke it & carry out deletion
      const resObj = await helpers.deleteMessage(msg);
      metas.push(resObj.meta);
      datas.push(resObj.data);
    }));
    resObj = {
      meta: {
        code: code,
        request: ids,
        results: metas
      },
      data: datas
    };
    console.log('final', resObj.data)
    dialect.sendResponse(resObj, res);
  });
};

const modDeleteSingleHandler = (req, res) => {
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    const numId = parseInt(req.params.id);
    resObj = await helpers.modTryDeleteMessages([numId], access_list);
    dialect.sendResponse(resObj, res);
  });
};

const modDeleteMultipleHandler = (req, res) => {
  if (!req.query.ids) {
    console.warn('moderation message mass delete ids empty');
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'ids missing',
    }));
    return;
  }
  const ids = req.query.ids.split(',');
  if (ids.length > 200) {
    console.warn('moderation message mass delete too many ids, 200<', ids.length);
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'too many ids',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    const resObj = await helpers.modTryDeleteMessages(ids, access_list);
    dialect.sendResponse(resObj, res);
  });
};

const addGlobalModerator = (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  const resObj = {
    meta: {
      code: 200
    },
    data: []
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    if (!usertoken) {
      console.error('handlers::addGlobalModerator - no validglobal usertoken');
    }
    if (!usertoken.userid) {
      console.error('handlers::addGlobalModerator - no userid in', usertoken);
    }
    // FIXME: support users by username
    const userid = parseInt(req.params.id);
    console.log('handlers::addGlobalModerator - upgrading', userid, 'to global moderator');
    res.data = await storage.addServerModerator(userid);
    dialect.sendResponse(resObj, res);
  });
};

const removeGlobalModerator = (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    const userid = parseInt(req.params.id);
    res.data = await storage.removeServerModerator(userid);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
};

// FIXME: normalize users refactor
const blacklistUserFromServerHandler = async (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    let userid = req.params.id;
    if (userid[0] == '@') {
      const userAdnObjects = await helpers.getUsers([userid]);
      if (userAdnObjects.length == 1) {
        userid = userAdnObjects[0].id;
      } else {
        res.status(410).type('application/json').end(JSON.stringify({
          error: 'user id not found',
        }));
        return;
      }
    }
    const result = await logic.blacklistUserFromServer(userid);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
}

const unblacklistUserFromServerHandler = async (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    let userid = req.params.id;
    if (userid[0] == '@') {
      const userAdnObjects = await helpers.getUsers([userid]);
      if (userAdnObjects.length == 1) {
        userid = userAdnObjects[0].id;
      } else {
        res.status(410).type('application/json').end(JSON.stringify({
          error: 'user id not found',
        }));
        return;
      }
    }
    const result = await logic.unblacklistUserFromServer(userid);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
}

const whitelistUserForServerHandler = async (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    let userid = req.params.id;

    const processUserId = async (userid) => {
      const result = await logic.whitelistUserForServer(userid);
      const resObj = {
        meta: {
          code: 200
        },
        data: []
      }
      dialect.sendResponse(resObj, res);
    }

    if (userid[0] == '@') {
      const userAdnObjects = await helpers.getUsers([userid]);
      console.log('whitelistUserForServerHandler userAdnObjects', userAdnObjects, 'for', userid);
      if (userAdnObjects.length == 1) {
        userid = userAdnObjects[0].id;
      } else {
        if (userAdnObjects.length == 0) {
          // if we're in whitelist mode
          const disk_config = config.getDiskConfig();
          if (disk_config.whitelist) {
            // the user isn't created yet and you can't create it
            cache.addUser(userid.substring(1), '', (newUser, err2) => {
              if (err2) {
                console.error('addUser err', err2);
                return res.status(500).type('application/json').end(JSON.stringify({
                  error: 'addUser ' + err2,
                }));
              }
              processUserId(newUser.id);
            });
            return;
          }
        }
        res.status(410).type('application/json').end(JSON.stringify({
          error: 'user id not found',
        }));
        return;
      }
    }
    processUserId(userid);
  });
}

const unwhitelistUserFromServerHandler = async (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    let userid = req.params.id;
    if (userid[0] == '@') {
      const userAdnObjects = await helpers.getUsers([userid]);
      if (userAdnObjects.length == 1) {
        userid = userAdnObjects[0].id;
      } else {
        res.status(410).type('application/json').end(JSON.stringify({
          error: 'user id not found',
        }));
        return;
      }
    }
    const result = await logic.unwhitelistUserFromServer(userid);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
}

const reportMessageHandler = async (req, res) => {
  const resObj = {
    meta: {
      code: 200
    },
    data: []
  }
  dialect.sendResponse(resObj, res);
}

module.exports = {
  setup,
  getChannelModeratorsHandler,
  moderatorUpdateChannel,
  getDeletesHandler,
  deleteMultipleHandler,
  modDeleteSingleHandler,
  modDeleteMultipleHandler,
  addGlobalModerator,
  removeGlobalModerator,
  blacklistUserFromServerHandler,
  unblacklistUserFromServerHandler,
  whitelistUserForServerHandler,
  unwhitelistUserFromServerHandler,
  reportMessageHandler,
};
