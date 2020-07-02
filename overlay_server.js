if (process.env['config-file-path'] === undefined) {
  process.env['config-file-path'] = 'config.json';
}
const middlewares = require('./middlewares.js');
var apps = require('./server/app.js');

apps.publicApp.use(middlewares.snodeOnionMiddleware);
// Express 4.x specific
// position it to spot 2
apps.publicApp._router.stack.splice(2, 0, apps.publicApp._router.stack.splice(apps.publicApp._router.stack.length - 1, 1)[0]);
