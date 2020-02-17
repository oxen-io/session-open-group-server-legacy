const overlay   = require('../../lib.overlay');
const handlers = require('./dialect_tokens_handlers');

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilties = overlay.setup(cache, app.dispatcher);
  utilties.overlay = overlay;
  handlers.setup(utilties);
  const { storage, logic, config, dialect } = utilties;

  app.get(prefix + '/loki/v1/get_challenge', handlers.getChallengeHandler);
  app.post(prefix + '/loki/v1/submit_challenge', handlers.submitChallengeHandler);
  app.get(prefix + '/loki/v1/user_info', handlers.getTokenInfoHandler);

  app.post(prefix + '/loki/v1/users/me/messages/purge', handlers.submitChallengeHandler);
  app.post(prefix + '/loki/v1/users/me/files/purge', handlers.submitChallengeHandler);
  app.post(prefix + '/loki/v1/users/me/channels/purge', handlers.submitChallengeHandler);

}
