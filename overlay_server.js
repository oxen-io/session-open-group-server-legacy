const path = require('path')

if (process.env['config-file-path'] === undefined) {
  process.env['config-file-path'] = path.join(__dirname, 'config.json');
}
const loki_middlewares = require('./middlewares.js');
const platform_middlewares = require('./server/middlewares.js');
const apps = require('./server/app.js');

const enableDebug = !!process.env['DEBUG']
if (enableDebug) {
  apps.publicApp.use(platform_middlewares.debugMiddleware);
  // Express 4.x specific
  // position it to spot 2
  apps.publicApp._router.stack.splice(2, 0, apps.publicApp._router.stack.splice(apps.publicApp._router.stack.length - 1, 1)[0]);
}

apps.publicApp.use(loki_middlewares.snodeOnionMiddleware);
// Express 4.x specific
// position it to spot 2
apps.publicApp._router.stack.splice(2, 0, apps.publicApp._router.stack.splice(apps.publicApp._router.stack.length - 1, 1)[0]);
