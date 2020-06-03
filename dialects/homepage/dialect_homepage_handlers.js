const pjson = require('../../package.json');

// all input / output filtering should happen here

let cache, dialect, config;
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic, config } = utilties);
};

const homePageHandler = async (req, res) => {
  const version = pjson.version;
  const disk_config = config.getDiskConfig()
  if (!disk_config) disk_config = {}
  if (!disk_config.api) disk_config.api = {}
  // console.log('disk_config', disk_config);
  cache.getAnnotations('channel', 1, function(note, err) {
    if (err) console.error('error', err)
    // console.log('note', JSON.stringify(note))

    var value = JSON.parse(note[0].value)
    // console.log('avatar', value.avatar)
    var whitelistMode = config.inWhiteListMode();
    // console.log('whitelistMode', whitelistMode, disk_config)
    res.render('index.ejs', {
      version: version,
      public_url: disk_config.api.public_url,
      c1_name: value.name,
      c1_logo: value.avatar,
      c1_desc: value.description,
      whitelistMode: whitelistMode,
    });
  })
  /*
  res.end(`
<html>
<head>
  <title>Loki Session Open Group Server</title>
</head>
<body>
  <h1>Loki <a href="https://getsession.org/">Session</a> Open Group Server</h1>
  <h2>Version ${version}</h2>
  <div>
    <a href="https://github.com/loki-project/session-open-group-server/wiki/How-to-join-an-open-group">How to join an open group</a>
  </div>
  <h6>Copyright <a href="https://loki.network">Loki Project</a> 2019-Current</h6>
  <h6>
    <a href="https://github.com/loki-project/session-open-group-server">GitHub</a>
    <a href="https://lokinet.org">Lokinet.org</a>
    <a href="https://loki.foundation">Loki Foundation</a>
    <a href="https://coinstop.io/">Merch</a>
  </h6>
</body>
</html>
`);
  */
};

module.exports = {
  setup,
  homePageHandler
};
