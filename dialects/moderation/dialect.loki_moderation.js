// global/general loki overlay setup/config
const overlay  = require('../../lib.overlay');
const handlers = require('./dialect_moderation_handlers');

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilities = overlay.setup(cache, app.dispatcher);
  utilities.cache = cache;
  utilities.dispatcher = app.dispatcher;
  utilities.nconf = app.nconf;
  utilities.overlay = overlay;
  handlers.setup(utilities);

  // Token: User
  app.post(prefix + '/loki/v1/channels/:channelid/messages/:id/report', handlers.reportMessageHandler);
  app.post(prefix + '/loki/v1/channels/messages/:id/report', handlers.reportMessageHandler);

  // get list of moderators per channel
  // legacy
  app.get(prefix + '/loki/v1/channel/:id/get_moderators', handlers.getChannelModeratorsHandler);
  // new official
  app.get(prefix + '/loki/v1/channels/:id/moderators', handlers.getChannelModeratorsHandler);

  app.put(prefix + '/loki/v1/channels/:id', handlers.moderatorUpdateChannel);

  // get a list of deletes in a channel
  // backwards compatibility
  app.get(prefix + '/loki/v1/channel/:id/deletes', handlers.getDeletesHandler);
  // new official URL to keep it consistent
  app.get(prefix + '/loki/v1/channels/:id/deletes', handlers.getDeletesHandler);

  // user multi delete
  app.delete(prefix + '/loki/v1/messages', handlers.deleteMultipleHandler);

  // mod single delete - deprecated
  app.delete(prefix + '/loki/v1/moderation/message/:id', handlers.modDeleteSingleHandler);
  // mod multi delete
  app.delete(prefix + '/loki/v1/moderation/messages', handlers.modDeleteMultipleHandler);

  // create moderator
  app.post(prefix + '/loki/v1/moderators/:id', handlers.addGlobalModerator);
  // remove moderator
  app.delete(prefix + '/loki/v1/moderators/:id', handlers.removeGlobalModerator);

  // blacklist userid
  app.post(prefix + '/loki/v1/moderation/blacklist/:id', handlers.blacklistUserFromServerHandler);
  app.delete(prefix + '/loki/v1/moderation/blacklist/:id', handlers.unblacklistUserFromServerHandler);

  // whitelist userid
  app.post(prefix + '/loki/v1/moderation/whitelist/:id', handlers.whitelistUserForServerHandler);
  app.delete(prefix + '/loki/v1/moderation/whitelist/:id', handlers.unwhitelistUserFromServerHandler);

}
