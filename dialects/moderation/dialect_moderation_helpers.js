
let config, cache, dispatcher, dialect;

const setup = (utilties) => {
  // logic are also available here
  ({ config, cache, dispatcher, dialect } = utilties);
};

// not currently used
const getUser = (userid) => {
  return new Promise((res, rej) => {
    cache.getUser(userid, (user, err) => {
      if (user) {
        res(user);
      } else {
        rej(err);
      }
    });
  });
};

const getUsers = async (userids) => {
  const count = userids.length;
  let results = [];
  let next200 = userids.splice(0, 200);
  const promises = [];
  while(next200.length) {

    // partition next200
    const [intList, userList] = next200.reduce((result, user) => {
      const isUsername = user[0] === '@';
      result[isUsername ? 1 : 0].push(isUsername ? user.substr(1) : user)
      return result
    }, [[], []]);

    // handle integer lookups
    if (intList.length) {
      promises.push(new Promise( (resolve, reject) => {
        cache.getUsers(intList, {}, (users, err) => {
          if (err) {
            return reject(err);
          }
          results = results.concat(users);
          return resolve(results);
        });
      }));
    }

    // handle username lookups
    userList.forEach(username => {
      promises.push(new Promise((resolve, reject) => {
        cache.getUserID(username, (userObj, err) => {
          if (err) {
            return reject(err);
          }
          results = results.concat([userObj]);
          return resolve(results);
        });
      }));
    });

    next200 = userids.splice(0, 200);
  }
  // console.log('getUsers awaiting', promises.length, 'promises for', count, 'user object lookups');
  await Promise.all(promises);
  return results; // array of model constructors
};

const validGlobal = (token, res, cb) => {
  dialect.validUser(token, res, async (usertoken) => {
    if (usertoken === undefined) {
      // should have already been handled by dialect.validUser
      return;
    }
    const list = await config.getUserAccess(usertoken.userid);
    if (!list) {
      // not even on the list
      const resObj={
        meta: {
          code: 401,
          error_message: "Call requires moderation: Moderation required for this endpoint."
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
  return new Promise((resolve, rej) => {
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
  return new Promise((resolve, rej) => {
    cache.getMessage(ids, (messages, getErr) => {
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
      metas.push({ code: 410 });
      datas.push(false);
      return;
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
        metas.push(resObj.meta);
        datas.push(false);
        return;
      }
    }

    // carry out deletion
    const resObj = await deleteMessage(message);
    resObj.meta.id = message.id;
    // ok how do we want to aggregate these results...
    metas.push(resObj.meta);
    datas.push(resObj.data);
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
  getUsers,
  getMessages,
  modTryDeleteMessages,
  deleteMessage
}
