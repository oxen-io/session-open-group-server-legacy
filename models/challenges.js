var challengeModel

const SESSION_TTL_MSECS = 120 * 1000; // 2 minutes

function start(options) {
  const { schema } = options
  /** challenge storage model */
  challengeModel = schema.define('users', {
    token: { type: String, length: 96 },
    pubKey: { type: String, length: 66 },
    expires_at: { type: Date, index: true }
  })
}


module.exports = {
  start: start,
  challengeAdd: (pubKey, token) => {
    const obj = new challengeModel
    obj.token = token
    obj.pubKey = pubKey
    obj.expires_at = Date.now() + SESSION_TTL_MSECS
    obj.save()
  },
  challengeDelete: (pubKey, token) => {
    challengeModel.remove({ where: { pubKey, token} }, function(err) {
      if (err) console.error(err)
    })
  },
  challengeValid: (token, cb) => {
    challengeModel.find({ where: { token, expires_at: { gt: new Date() } }}, (err, challeneges) => {
      if (err) console.error(err)
      if (!challeneges.length) {
        return cb(false)
      }
      cb(true)
    })
  }
}
