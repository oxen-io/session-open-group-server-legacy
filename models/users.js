var userModel;

function start(options) {
  const { schema } = options;
  /** user storage model */
  userModel = schema.define('users', {

  });
};


module.exports = {
  start: start,

}
