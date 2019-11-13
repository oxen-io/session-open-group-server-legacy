const helpers = require('./dialect_moderation_helpers');

// all input / output filtering should happen here

let cache, dialect, logic, storage
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic, storage } = utilties);
  helpers.setup(utilties);
};

const getChannelModeratorsHandler = async (req, res) => {
  const channelId = parseInt(req.params.id);
  if (isNaN(channelId)) {
    console.warn('id is not a number');
    res.status(400).type('application/json').end(JSON.stringify({
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
      if (!msg || !msg.user) {
        // not even on the list
        console.warn('no message or user object', msg);
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
      if (msg.user.id !== usertoken.userid) {
        // not even on the list
        console.warn('user', usertoken.userid, 'tried to delete users', msg.user.id, 'message', msg.id);
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
    console.log('handlers::addGlobalModerator - upgrading', usertoken.userid, 'to global moderator');
    res.data = await storage.addServerModerator(usertoken.userid);
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
    res.data = await storage.removeServerModerator(usertoken.userid);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
};

const blacklistUserFromServerHandler = (req, res) => {
  if (!req.params.id) {
    res.status(422).type('application/json').end(JSON.stringify({
      error: 'user id missing',
    }));
    return;
  }
  helpers.validGlobal(req.token, res, async (usertoken, access_list) => {
    const result = await logic.blacklistUserFromServer(req.params.id);
    const resObj = {
      meta: {
        code: 200
      },
      data: []
    }
    dialect.sendResponse(resObj, res);
  });
}

module.exports = {
  setup,
  getChannelModeratorsHandler,
  getDeletesHandler,
  deleteMultipleHandler,
  modDeleteSingleHandler,
  modDeleteMultipleHandler,
  addGlobalModerator,
  removeGlobalModerator,
  blacklistUserFromServerHandler,
};
