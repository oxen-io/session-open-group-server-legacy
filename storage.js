const funcs = [];
funcs.push(require('./models/users.js'));
funcs.push(require('./models/challenges.js'));
funcs.push(require('./models/roles.js'));
funcs.push(require('./models/user_roles.js'));
funcs.push(require('./models/role_permissions.js'));

const Schema = require('caminte').Schema

memoryUpdate = function (model, filter, data, callback) {
  'use strict';
  if ('function' === typeof filter) {
    return filter(new Error('Get parametrs undefined'), null);
  }
  if ('function' === typeof data) {
    return data(new Error('Set parametrs undefined'), null);
  }
  filter = filter.where ? filter.where : filter;
  var mem = this;

  // filter input to make sure it only contains valid fields
  var cleanData = this.toDatabase(model, data);

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
      var count = nodes.length;
      if (!count) {
        return callback(false, cleanData);
      }
      nodes.forEach(function(node) {
        mem.cache[model][node.id] = Object.assign(node, cleanData);
        if (--count === 0) {
          callback(false, cleanData);
        }
      });
    });
  }
}

function start(config) {
  // schema backend type
  const schemaType = 'memory';
  const options = {};
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

  var modelOptions = {
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
}

let functions = {};
funcs.forEach((func) => {
  functions = Object.assign(functions, func);
});

module.exports = functions;
// override all those starts
module.exports.start = start;
