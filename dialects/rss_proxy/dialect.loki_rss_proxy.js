const dns   = require('dns');
const fetch = require('node-fetch');

// mount will set this
let cache;

const sendresponse = (json, resp) => {
  const ts = Date.now();
  const diff = ts-resp.start;
  if (diff > 1000) {
    // this could be to do the client's connection speed
    // how because we stop the clock before we send the response...
    console.log(`${resp.path} served in ${ts - resp.start}ms`);
  }
  if (json.meta && json.meta.code) {
    resp.status(json.meta.code);
  }
  if (resp.prettyPrint) {
    json=JSON.parse(JSON.stringify(json,null,4));
  }
  //resp.set('Content-Type', 'text/javascript');
  resp.type('application/json');
  resp.setHeader("Access-Control-Allow-Origin", "*");
  resp.json(json);
}

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;

  /*
  This contains all the code session needs to communicate with the Loki foundation.
  So while we're mostly decentralized, we have this last few items to address.
  */

  app.get(prefix + '/loki/v1/rss/messenger', (req, res) => {
    res.start = Date.now();
    //console.log('rss/messenger');
    fetch('https://loki.network/category/messenger-updates/feed/')
      .then(fetchRes => fetchRes.text())
      .then(body => {
        sendresponse({
          meta: {
            code: 200
          },
          data: body
        }, res);
      });
  });
  app.get(prefix + '/loki/v1/rss/loki', (req, res) => {
    res.start = Date.now();
    //console.log('rss/loki');
    fetch('https://loki.network/feed/')
      .then(fetchRes => fetchRes.text())
      .then(body => {
        sendresponse({
          meta: {
            code: 200
          },
          data: body
        }, res);
      });
  });
  app.get(prefix + '/loki/v1/version/client/desktop', (req, res) => {
    dns.resolveTxt('desktop.version.getsession.org', function(err, records) {
      // just be transparent
      sendresponse({
        meta: {
          code: err?500:200,
          error: err
        },
        data: records
      }, res);
    });
  });

  app.get(prefix + '/loki/v1/getOpenGroupKey/:host', (req, res) => {
    res.start = Date.now();
    const safeHost = req.params.host.replace(/^[^A-Za-z0-9:\.]{1,63}$/, '');
    //console.log('getOpenGroupKey', safeHost);
    let status
    fetch(`https://${safeHost}/loki/v1/public_key`)
      .then(fetchRes => {
        status = fetchRes.status
        return fetchRes.text()
      })
      .then(body => {
        sendresponse({
          meta: {
            code: status
          },
          data: body
        }, res);
      });
  });

}
