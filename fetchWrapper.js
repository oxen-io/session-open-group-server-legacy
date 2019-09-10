
// ES2015 arrow functions cannot be constructors
const adnServerAPI = function(url, token) {
  this.token = token;
  // strip trailing slash
  this.base_url = url.replace(/\/$/, '');

  // make a request to the server
  this.serverRequest = async (endpoint, options = {}) => {
    const { params = {}, method, objBody } = options;
    const url = new URL(`${this.base_url}/${endpoint}`);
    if (params) {
      url.search = new URLSearchParams(params);
    }
    let result;
    try {
      const fetchOptions = {};
      const headers = {};
      if (this.token) {
        headers.Authorization = `Bearer ${this.token}`;
      }
      if (method) {
        fetchOptions.method = method;
      }
      if (objBody) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(objBody);
      }
      fetchOptions.headers = new Headers(headers);
      result = await fetch(url, fetchOptions || undefined);
    } catch (e) {
      console.log(`e ${e}`);
      return {
        err: e,
      };
    }
    let response = null;
    if (options.noJson) {
      return {
        statusCode: result.status,
        response,
      };
    }
    try {
      response = await result.json();
    } catch (e) {
      console.log(`serverRequest json parse ${e}`);
      return {
        err: e,
        statusCode: result.status,
      };
    }

    // if it's a response style with a meta
    if (result.status !== 200) {
      return {
        err: 'statusCode',
        statusCode: result.status,
        response,
      };
    }
    return {
      statusCode: result.status,
      response,
    };
  }
}

// node and browser compatibility
; // this semicolon is required
(function(ref) {
  if (ref.constructor.name == 'Module') {
    // node
    fetch = require('node-fetch');
    global.Headers = fetch.Headers;
    module.exports = adnServerAPI;
  } else {
    // browser
    // should be already set
    //window['adnServerAPI'] = adnServerAPI
  }
})(typeof(module)=== 'undefined' ? this : module);
