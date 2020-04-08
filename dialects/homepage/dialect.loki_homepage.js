const overlay   = require('../../lib.overlay');
const handlers = require('./dialect_homepage_handlers');

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilties = overlay.setup(cache, app.dispatcher);
  handlers.setup(utilties);
  const { storage, logic, config, dialect } = utilties;

  app.get(prefix + '/', handlers.homePageHandler);
}
