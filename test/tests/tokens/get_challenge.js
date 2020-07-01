const assert = require('assert');

const lib = require('../lib');

module.exports = (testInfo) => {
  lib.setup(testInfo);
  it('get token', async function() {
    // does this belong here?
    if (testInfo.config.inWhiteListMode()) {
      console.log('Oh were in whitelist model, going to need to permit ourselves...', testInfo.ourPubKeyHex);
      const modToken = await testInfo.selectModToken(testInfo.channelId);
      if (!modToken) {
        console.log('No mod token to whitelist temporary user', testInfo.ourPubKeyHex);
        process.exit(1);
      }
      testInfo.platformApi.token = modToken;
      const result = await testInfo.platformApi.serverRequest('loki/v1/moderation/whitelist/@' + testInfo.ourPubKeyHex, {
        method: 'POST',
      });
      if (result.statusCode !== 200 || result.response.meta.code !== 200) {
        console.log('Failed to whitelist temporary user', testInfo.ourPubKeyHex, result);
        process.exit(1);
      }
    }

    const result = await lib.get_challenge(testInfo.ourPubKeyHex);
    assert.equal(200, result.statusCode);
    testInfo.tokenString = await lib.decodeToken(testInfo.ourKey, result);
    assert.ok(testInfo.tokenString);
    // console.log('testInfo set tokenString', testInfo.tokenString)
  });
}
