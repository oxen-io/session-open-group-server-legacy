// even though we want to conform to the dialect API
// we need to amend data_access and dispatcher with our own models and api
//
// best we have a single entry point for all our common dialect to reduce set up in them

const storage = require('./storage');
const config  = require('./config');
const logic   = require('./logic');
const dialect = require('./lib.dialect');

// Look for a config file
const disk_config = config.getDiskConfig();
storage.start(disk_config);

const setup = (cache, dispatcher) => {
  config.setup({ cache, storage });
  logic.setup({ storage, cache, config });
  dialect.setup({ dispatcher });
  return { storage, logic, config, dialect, cache };
}

module.exports = {
  setup
};
