const assert = require('assert');

module.exports = (testInfo) => {
  it('homepage check', async function() {
    // test token endpoints
    const result = await testInfo.overlayApi.serverRequest('', {
      noJson: true
    });
    assert.equal(200, result.statusCode);
  });
}
