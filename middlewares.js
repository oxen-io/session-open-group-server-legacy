
const ByteBuffer = require('bytebuffer');

// snode hack work around
// preserve original body
function snodeOnionMiddleware(req, res, next) {
  // scope the damage of this...
  // so it doesn't affect file uploads
  if (req.method === 'POST' && req.path === '/loki/v1/lsrpc') {
    let resolver;
    req.lokiReady = new Promise(res => {
      resolver = res
    });
    let body = '';
    req.on('data', function (data) {
      body += data.toString();
    });
    req.on('end', function() {
      // preserve original body
      req.originalBody = body;
      // console.log('perserved', body);
      resolver(); // resolve promise
    });
  } else if (req.method === 'POST' && (req.path === '/loki/v2/lsrpc' || req.path === '/loki/v3/lsrpc') ) {

    let resolver;
    req.lokiReady = new Promise(res => {
      resolver = res
    });

    let buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, true);

    let size = 0;
    req.on('data', function (data) {
      size += data.length;
      buffer.append(data);
    });
    req.on('end', function() {
      // reset buffer's offset and set limit to capacity
      buffer.compact(0, size);
      buffer.clear();
      req.originalBody = buffer.toArrayBuffer();
      resolver(); // resolve promise
    });
  }
  next();
}

module.exports = {
  snodeOnionMiddleware: snodeOnionMiddleware
};
