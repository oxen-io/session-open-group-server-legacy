const assert = require('assert');

const lib = require('../lib');

module.exports = (testInfo) => {
  lib.setup(testInfo);
  it('activate token', async function() {
    // activate token
    const result = await lib.submit_challenge(testInfo.tokenString, testInfo.ourPubKeyHex);
    assert.equal(200, result.statusCode);
    // body should be ''
    //console.log('submit challenge body', body);
  });
}
