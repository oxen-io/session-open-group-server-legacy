const funcs = [];
funcs.push(require('./models/users.js'));
funcs.push(require('./models/challenges.js'));
funcs.push(require('./models/roles.js'));
funcs.push(require('./models/user_roles.js'));
funcs.push(require('./models/role_permissions.js'));

const Schema = require('caminte').Schema

const memoryUpdate = (model, filter, data, callback) => {
  'use strict';
  if ('function' === typeof filter) {
    return filter(new Error('Get parametrs undefined'), null);
  }
  if ('function' === typeof data) {
    return data(new Error('Set parametrs undefined'), null);
  }
  filter = filter.where ? filter.where : filter;
  const mem = this;

  // filter input to make sure it only contains valid fields
  const cleanData = this.toDatabase(model, data);

  if (data.id) {
    // should find one and only one
    this.exists(model, data.id, function (err, exists) {
      if (exists) {
        mem.save(model, Object.assign(exists, cleanData), callback);
      } else {
        callback(err, cleanData);
      }
    })
  } else {
    this.all(model, filter, function(err, nodes) {
      if (!nodes.length) {
        return callback(false, cleanData);
      }
      nodes.forEach(function(node) {
        mem.cache[model][node.id] = Object.assign(node, cleanData);
      });
      callback(false, cleanData);
    });
  }
}

function start(config) {
  // schema backend type
  const schemaType = process.env.database__default__type || config && config.database && config.database.type ||'memory';
  //console.log('storage config', config)
  const options = {
    host: config && config.database && config.database.host || 'localhost',
    database: config && config.database && config.database.database || 'lmpc_overlay',
    username: config && config.database && config.database.username || 'overlay',
    password: config && config.database && config.database.password || 'publicchat_test',
  };
  //console.log('options', options)
  if (process.env.database__default__options__host) {
    options.host = process.env.database__default__options__host;
  }
  if (process.env.database__default__options__database) {
    options.database = process.env.database__default__options__database;
  }
  if (process.env.database__default__options__username) {
    options.username = process.env.database__default__options__username;
  }
  if (process.env.database__default__options__password) {
    options.password = process.env.database__default__options__password;
  }

  if (process.env.database__overlay__options__username) {
    options.username = process.env.database__overlay__options__username;
  }
  if (process.env.database__overlay__options__password) {
    options.password = process.env.database__overlay__options__password;
  }
  if (process.env.database__overlay__options__database) {
    options.database = process.env.database__overlay__options__database;
  }
  const schema = new Schema(schemaType, options);
  if (schemaType === 'memory') {
    schema.adapter.update = memoryUpdate;
  }
  if (schemaType==='mysql') {
    //charset: "utf8_general_ci" / utf8mb4_general_ci
    // run a query "set names utf8"
    schema.client.changeUser({ charset: 'utf8mb4' }, function(err) {
      if (err) console.error('Couldnt set UTF8mb4', err);
    });

    // to enable emojis we may need to run these
    // alter table X MODIFY `Y` type CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
  }

  const modelOptions = {
    schema: schema,
  };
  funcs.forEach((func) => {
    func.start(modelOptions);
  });

  if (schemaType=='mysql' || schemaType=='sqlite3') {
    //schema.automigrate(function() {});
    // don't lose data
    schema.autoupdate(function() {});
  }

  var dbMonitor=function () {
    if (schemaType=='mysql') {
      schema.client.ping(function (err) {
        if (err) {
          console.log('trying to reconnect to data db');
          schema = new Schema(schemaType, options);
        }
      })
    }
  }
  dbMonitor();
  setInterval(dbMonitor, 60*1000);

}

module.exports = {};
funcs.map(func => Object.assign(module.exports, func));

// override all those starts
module.exports.start = start;
