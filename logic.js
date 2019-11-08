const funcs = [];
funcs.push(require('./logic/permissions.js'));

let storage;
let cache;

function setup(configObject) {
  ({ storage, cache, config } = configObject);

  funcs.forEach((func) => {
    func.start(configObject);
  });
}

let functions = {};
funcs.forEach((func) => {
  functions = Object.assign(functions, func);
});

module.exports = functions;
// override all those starts
module.exports.setup = setup;
