const assert = require('assert');

const lib = require('../lib');

module.exports = (testInfo) => {
  lib.setup(testInfo);
  it('get token', async function() {
    const disk_config = testInfo.disk_config;
    if (testInfo.disk_config.whitelist) {
      console.log('Oh were in whitelist model, going to need to permit ourselves...', ourPubKeyHex);
      const modToken = await selectModToken(channelId);
      if (!modToken) {
        console.log('No mod token to whitelist temporary user', ourPubKeyHex);
        process.exit(1);
      }
      modApi.token = modToken;
      const result = await modApi.serverRequest('loki/v1/moderation/whitelist/@' + ourPubKeyHex, {
        method: 'POST',
      });
      console.log('Ok attempted to whitelist', ourPubKeyHex);
      if (result.statusCode !== 200 || result.response.meta.code !== 200) {
        console.log('Failed to whitelist temporary user', ourPubKeyHex, result);
        process.exit(1);
      }
    }

    const result = await lib.get_challenge(testInfo.ourPubKeyHex);
    assert.equal(200, result.statusCode);
    testInfo.tokenString = await lib.decodeToken(testInfo.ourKey, result);
    assert.ok(testInfo.tokenString);
  });
}
