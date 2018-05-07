var express    = require('express')
var request    = require('request')
var bodyParser = require('body-parser')
var Cookies    = require('cookies')
var multer     = require('multer')

var app = express()
var router = express.Router()

/** need this for POST parsing */
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({
  extended: true
}))

app.all('/*', function(req, res, next){
  res.start=new Date().getTime();
  origin = req.get('Origin') || '*';
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.set('Access-Control-Expose-Headers', 'Content-Length');
  res.set('Access-Control-Allow-Credentials', 'true');
  res.set('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization'); // add the list of headers your site allows.
  if (req.method === 'OPTIONS') {
    var ts=new Date().getTime();
    var diff = ts-res.start
    if (diff > 100) {
      console.log('app.js - OPTIONS requests served in', (diff)+'ms', req.path);
    }
    return res.sendStatus(200);
  }
  next();
});

var storage = multer.memoryStorage()
var upload = multer({ storage: storage, limits: {fileSize: 100*1024*1024} });

app.use(upload.single('content'))

app.use(function (req, res, next) {
  req.cookies = new Cookies(req, res)
  res.path = req.path

  if (req.get('Authorization') || req.query.access_token) {
    if (req.query.access_token) {
      //console.log('app.js - Authquery',req.query.access_token);
      req.token=req.query.access_token;
    } else {
      //console.log('authheader');
      if (req.get('Authorization')) {
        req.token=req.get('Authorization').replace(/Bearer /i, '');
        req.query.access_token = req.token // just make a querystring for now
      }
    }
  }

  // only one cookie we care about
  console.log('proxying', req.method, req.path, req.query, req.cookies.get('altapi'), 'from', req.connection.remoteAddress)
  if (req.file) {
    console.log('POSTfiles - file upload got', req.file.buffer.length, 'bytes')
  }
  // proxy
  var requestSettings = {
    url: 'http://127.0.0.1:7070' + req.path,
    method: req.method,
    qs: req.query,
    followRedirect: false,
    forever: true, // keepalive
    headers: {
      'x-forwarded-for': req.connection.remoteAddress
    }
  }
  if (req.cookies.get('altapi')) {
    var j = request.jar()
    j.setCookie('altapi', req.cookies.get('altapi'))
    //console.log('setting upstream cookie', req.cookies.get('altapi'))
    requestSettings.jar = j
  }
  if (req.file) {
    requestSettings.formData = {}
    requestSettings.formData['content'] = {
      value: req.file.buffer,
      options: {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
        knownLength: req.file.buffer.length
      }
    }
    for(var k in req.body) {
      console.log('fup postData', k, req.body[k])
      requestSettings.formData[k] = req.body[k]
    }
    requestSettings.json = true
  } else
  if (Object.keys(req.body).length) {
    //console.log('body', req.body, typeof(req.body))
    requestSettings.json = true
    requestSettings.body = req.body
  }
  request(requestSettings, function(err, proxyRes, body) {
    if (err) console.error('proxy', err)
    //console.log('upstream headers', proxyRes.headers)
    if (proxyRes.headers) {
      // process response headers
      if (proxyRes.headers['set-cookie']) {
        //console.log('upstream setting cookies', proxyRes.headers['set-cookie'])
        for(var i in proxyRes.headers['set-cookie']) {
          var cookie = proxyRes.headers['set-cookie'][i]
          var parts = cookie.split(/=/)
          var key = parts[0]
          var value = parts[1]
          console.log('setting downstream cookie', key, '=', value)
          res.cookie(key, value)
        }
      }
      if (proxyRes.headers['location']) {
        console.log('redirecting downstream', proxyRes.headers['location'], proxyRes.statusCode)
        res.writeHead(proxyRes.statusCode, proxyRes.headers)
      }
    }
    //console.log('resBody', body, typeof(body))
    if (requestSettings.json) {
      res.end(JSON.stringify(body))
    } else {
      res.end(body)
    }
  })
})

app.listen(8081)
