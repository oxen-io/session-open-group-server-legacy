
let config, cache, dispatcher, dialect;

const setup = (utilties) => {
  // logic are also available here
  ({ config, cache, dispatcher, dialect } = utilties);
};

const getUser = (userid) => {
  return new Promise((res, rej) => {
    cache.getUser(userid, (user, err) => {
      //console.log('getUser', user)
      if (user) {
        res(user);
      } else {
        rej(err);
      }
    });
  });
};

const getUsers = (userids) => {
  return new Promise((res, rej) => {
    let results = [];
    let requests = 0;
    let responses = 0;
    let next200 = userids.splice(0, 200);
    while(next200.length) {
      requests++;
      // allow them to overlap
      cache.getUsers(next200, {}, (users, err) => {
        if (err) {
          return rej(err);
        }
        // console.log('getUsers', users)
        results = results.concat(users);
        responses++;
        if (requests === responses) {
          // console.log('results', results);
          return res(results);
        }
      });
      next200 = userids.splice(0, 200);
    }
  });
};

const validGlobal = (token, res, cb) => {
  //console.log('dialect_moderation_helpers::validGlobal', token)
  dialect.validUser(token, res, async (usertoken) => {
    if (usertoken === undefined) {
      // should have already been handled by dialect.validUser
      return;
    }
    //console.log('usertoken', usertoken);
    const list = await config.getUserAccess(usertoken.userid);
    //console.log('list', list);
    if (!list) {
      // not even on the list
      const resObj={
        meta: {
          code: 401,
          error_message: "Call requires authentication: Authentication required to fetch token."
        }
      };
      return dialect.sendResponse(resObj, res);
    }
    if (list.match && list.match(/,/)) {
      return cb(usertoken, list.split(/,/));
    }
    cb(usertoken, true);
  });
};

const deleteMessage = (msg) => {
  return new Promise(function(resolve, rej) {
    // carry out deletion
    cache.deleteMessage(msg.id, msg.channel_id, (message, delErr) => {
      // handle errors
      if (delErr) {
        console.error('tryDeleteMessage mod deleteMessage err', delErr);
        const resObj={
          meta: {
            code: 500,
            error_message: delErr
          }
        };
        return resolve(resObj);
      }
      const resObj={
        meta: {
          code: 200,
        },
        data: msg
      };
      resObj.data.is_deleted = true;
      return resolve(resObj);
    });
  })
};

const getMessages = (ids) => {
  return new Promise(function(resolve, rej) {
    //console.log('dialect_moderation_helpers::getMessage starting', ids)
    cache.getMessage(ids, (messages, getErr) => {
      //console.log('dialect_moderation_helpers::getMessage returned')
      // handle errors
      if (getErr) {
        console.error('getMessage err', getErr);
        return resolve([500, getErr, false]);
      }

      if (!messages || !messages.length) {
        return resolve([410, 'no messages', false]);
      }
      // single result
      if (!Array.isArray(messages)) {
        messages = [messages];
      }
      resolve([200, false, messages]);
    })
  });
};

const modTryDeleteMessages = async (ids, access_list) => {
  const [ code, err, messages ] = await getMessages(ids);
  if (err) {
    const resObj = {
      meta: {
        code,
        request: ids,
        err
      },
      data: messages
    };
    return resObj;
  }
  const metas = [];
  const datas = [];
  await Promise.all(messages.map(async (message) => {
    // handle already deleted messages
    if (!message || message.is_deleted) {
      const resObj={
        meta: {
          code: 410,
        }
      };
      return resObj;
    }

    // if not full access
    if (access_list !== true) {
      // see if this message's channel is on the list
      const allowed = access_list.indexOf(message.channel_id);
      if (allowed === -1) {
        // not allowed to manage this channel
        const resObj={
          meta: {
            code: 403,
            error_message: "You're not allowed to moderation this channel"
          }
        };
        return resObj;
      }
    }
    //console.log('tryDeleteMessage message', message)

    // carry out deletion
    const resObj = await deleteMessage(message);
    resObj.meta.id = message.id;
    // ok how do we want to aggregate these results...
    metas.push(resObj.meta);
    datas.push(resObj.meta);
  }));
  resObj = {
    meta: {
      code: 200,
      request: ids,
      results: metas
    },
    data: datas
  }
  return resObj;
};

module.exports = {
  setup,
  validGlobal,
  getMessages,
  modTryDeleteMessages,
  deleteMessage
}
