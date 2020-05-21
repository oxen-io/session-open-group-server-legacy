const overlay   = require('../../lib.overlay');
const handlers = require('./dialect_homepage_handlers');

const express = require('express')

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilties = overlay.setup(cache, app.dispatcher);
  handlers.setup(utilties);
  const { storage, logic, config, dialect } = utilties;

  app.use('/images', express.static('public/images') );
  app.use('/css',    express.static('public/css')    );
  app.use('/js',     express.static('public/js')     );

  app.engine('html', require('ejs').renderFile);
  app.set('view engine', 'html');
  // app.set('views', 'views');

  app.get(prefix + '/', handlers.homePageHandler);
}
