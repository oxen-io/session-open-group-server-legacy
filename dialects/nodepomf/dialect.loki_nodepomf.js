const overlay = require('../../lib.overlay');
const http = require('http');
const pathUtil = require('path');
const fs = require('fs');
const express = require('express');
const lokinet = require('loki-launcher/lokinet');
const configUtil = require('../../server/lib/lib.config.js')

module.exports = (app, prefix) => {
  // set cache based on dispatcher object
  cache = app.dispatcher.cache;
  const utilties = overlay.setup(cache, app.dispatcher);
  const nconf = app.nconf;
  const { storage, logic, config, dialect } = utilties;

  // start server
  if (process.env.NPOMF_DB_FILENAME === undefined) {
    process.env.NPOMF_DB_FILENAME = './databases/pomf_files.db';
  }
  var dir = pathUtil.dirname(process.env.NPOMF_DB_FILENAME)
  if (!fs.existsSync(dir)) {
    console.log('creating nodepomf database directory', dir);
    lokinet.mkDirByPathSync(dir);
  }

  if (configUtil.isQuiet()) {
    process.env.NPOMF_QUIET = true;
  }

  if (process.env.NPOMF_MAX_UPLOAD_SIZE === undefined) {
    // if not set, pull from nconf, else default
    process.env.NPOMF_MAX_UPLOAD_SIZE = nconf.get('limits:default:max_file_size') || 10 * 1000 * 1000; // 10mb
  }
  // Loki messenger requires this to be an absolute URL
  // I think it's better to fix messenger
  // it's just a better server ux, if it doesn't have know it's public virtual hosting names
  if (process.env.NPOMF_FILE_URL === undefined) {
    var diskConfig = config.getDiskConfig();

    // default public url for downloading files
    process.env.NPOMF_FILE_URL = '/f';

    // we no longer support api or api.public_url
    // allow web:public_host to override it
    // host includes port (otherwise i'd be hostname)
    if (nconf.get('web:public_host')) {
      process.env.NPOMF_FILE_URL = 'https://' + nconf.get('web:public_host') + '/f';
    }
    if (nconf.get('web:public_url')) {
      const url = nconf.get('web:public_url').replace(/\/$/, ''); // strip any trailing slash
      process.env.NPOMF_FILE_URL = url + '/f';
    }
    if (diskConfig.storage && diskConfig.storage.download_url) {
      process.env.NPOMF_FILE_URL = diskConfig.storage.download_url + '/f'
    }
  }
  //process.env.NPOMF_PORT = 4000;
  // we write uploaded fiels to ./files
  // this seems to break the upload though...
  // upload is relative to cwd
  // download is relative to nodepomf/
  //process.env.NPOMF_UPLOAD_DIRECTORY = '../files';
  var fileUploadPath = process.env.NPOMF_UPLOAD_DIRECTORY ? process.env.NPOMF_UPLOAD_DIRECTORY : 'files'

  // make sure it's an absolute path
  if (fileUploadPath[0] !== '/') {
    fileUploadPath = pathUtil.join(process.cwd(), fileUploadPath);
  }
  if (!fs.existsSync(fileUploadPath)) {
    console.log('creating nodepomf files directory', fileUploadPath);
    lokinet.mkDirByPathSync(fileUploadPath);
  }

  const nodepomf  = require('../../nodepomf/app');

  app.use(prefix + '/upload', function(req, res) {
    // fix up URL
    req.url = prefix + '/upload';
    nodepomf(req, res);
  });

  app.use(prefix + '/f', express.static(fileUploadPath));

  /// ************************************************
  /// The endpoint bellow is messy... It seems to be important
  /// for open groups, but breaks private conversations? (where
  /// this server is used as a submodule)
  /// ************************************************

  app.use(prefix + '/loki/v1/f/:file', function(req, res) {
    const safePath = req.params.file.replace(/[\.\/]/g, '');

    try {
      const buf = fs.readFileSync('files/' + safePath);

      /// NOTE: attachments in private conversations are saved under
      /// `/root/nodepomf/files/` (not in `files/` relative to current dir)

      // const buf = fs.readFileSync('/root/nodepomf/files/' + safePath);
      res.type('application/octet-stream');
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(buf);

    } catch (err) {

      console.error("Could not load file: ", err);
      res.end("Could not open file");
    }
  });
}
