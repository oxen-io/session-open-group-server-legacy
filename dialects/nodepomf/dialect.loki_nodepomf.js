const overlay = require('../../lib.overlay');
const http = require('http');
const pathUtil = require('path');
const express = require('express');

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilties = overlay.setup(cache, app.dispatcher);
  const { storage, logic, config, dialect } = utilties;

  // start server
  if (process.env.NPOMF_DB_FILENAME === undefined) {
    process.env.NPOMF_DB_FILENAME = './databases/pomf_files.db';
  }
  if (process.env.NPOMF_MAX_UPLOAD_SIZE === undefined) {
    process.env.NPOMF_MAX_UPLOAD_SIZE = 1000000; // 10mb
  }
  // Loki messenger requires this to be an absolute URL
  // I think it's better to fix messenger
  // it's just a better server ux, if it doesn't have know it's public virtual hosting names
  if (process.env.NPOMF_FILE_URL === undefined) {
    process.env.NPOMF_FILE_URL = '/f'; // public url for downloading files
  }
  //process.env.NPOMF_PORT = 4000;
  // we write uploaded fiels to ./files
  // this seems to break the upload though...
  // upload is relative to cwd
  // download is relative to nodepomf/
  //process.env.NPOMF_UPLOAD_DIRECTORY = '../files';

  const nodepomf  = require('../../nodepomf/app');

  app.use(prefix + '/upload', function(req, res) {
    // fix up URL
    req.url = prefix + '/upload';
    nodepomf(req, res);
  });
  // NPOMF_UPLOAD_DIRECTORY is broken
  /*
  app.use(prefix + '/f', function(req, res) {
    req.url = prefix + '/f' + req.url;
    nodepomf(req, res);
  });
  */

  app.use(prefix + '/f', function(req, res) {
    var fileUploadPath = process.env.NPOMF_UPLOAD_DIRECTORY ? process.env.NPOMF_UPLOAD_DIRECTORY : 'files'
    console.log('relative? download path', fileUploadPath)
    var path = pathUtil.join(process.cwd(), fileUploadPath)
    console.log('absolute download path', path)
    express.static(path)(req, res)
  });

  // only pass through /f requests
  /*
  app.get(prefix + '/f', function(req, res) {
    // redirect file from 127.0.0.1:4000

    const url = 'http://127.0.0.1:4000/f/';

    const request = http.get(url, function(response) {
        const contentType = response.headers['content-type'];
        //console.log(contentType);
        res.setHeader('Content-Type', contentType);
        response.pipe(res);
    });

    request.on('error', function(e){
        console.error(e);
    });
  });
  */
}
