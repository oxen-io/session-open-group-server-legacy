const pjson = require('../../package.json');

// all input / output filtering should happen here

let cache, dialect, config, nconf;
const setup = (utilties) => {
  // config are also available here
  ({ cache, dialect, logic, config, nconf } = utilties);
};

const homePageHandler = async (req, res) => {
  const version = pjson.version;
  /*
  const disk_config = config.getDiskConfig()
  if (!disk_config) {
    disk_config = {};
  }
  if (!disk_config.api) {
    disk_config.api = {};
  }
  */
  // no trailing slash is needed
  let public_url = 'https://localhost';
  if (nconf.get('web:public_host')) {
    public_url = 'https://' + nconf.get('web:public_host')
  }
  // console.log('disk_config', disk_config);
  cache.getAnnotations('channel', 1, function(note, err) {
    if (err) console.error('error', err)
    // console.log('note', JSON.stringify(note))

    var value = JSON.parse(note[0].value);
    // console.log('avatar', value.avatar)
    var whitelistMode = config.inWhiteListMode();
    // console.log('whitelistMode', whitelistMode, disk_config)
    res.render('index.ejs', {
      version: version,
      public_url: public_url,
      c1_name: value.name,
      c1_logo: value.avatar,
      c1_desc: value.description,
      whitelistMode: whitelistMode,
    });
  });
};

module.exports = {
  setup,
  homePageHandler
};
