// global/general loki overlay setup/config
const overlay  = require('../../lib.overlay');
const handlers = require('./dialect_moderation_handlers');

//
// helpers
//

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilities = overlay.setup(cache, app.dispatcher);
  utilities.cache = cache;
  utilities.dispatcher = app.dispatcher;
  handlers.setup(utilities);

  // legacy
  app.get(prefix + '/loki/v1/channel/:id/get_moderators', handlers.getChannelModeratorsHandler);
  // new official
  app.get(prefix + '/loki/v1/channels/:id/moderators', handlers.getChannelModeratorsHandler);

  // backwards compatibility
  app.get(prefix + '/loki/v1/channel/:id/deletes', handlers.getDeletesHandler);
  // new official URL to keep it consistent
  app.get(prefix + '/loki/v1/channels/:id/deletes', handlers.getDeletesHandler);

  // user multi delete
  app.delete(prefix + '/loki/v1/messages', handlers.deleteMultipleHandler);

  app.delete(prefix + '/loki/v1/moderation/message/:id', handlers.modDeleteSingleHandler);
  // single mod delete, deprecated
  app.delete(prefix + '/loki/v1/moderation/messages', handlers.modDeleteMultipleHandler);

  app.post(prefix + '/loki/v1/moderators/:id', handlers.addGlobalModerator);
  app.delete(prefix + '/loki/v1/moderators/:id', handlers.removeGlobalModerator);

  app.post(prefix + '/loki/v1/moderation/blacklist/:id', handlers.blacklistUserFromServerHandler);

}
