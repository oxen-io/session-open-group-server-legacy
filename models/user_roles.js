var userRoleModel;

function start(options) {
  const { schema } = options
  /** user_role storage model */
  userRoleModel = schema.define('user_roles', {
    user_id: { type: Number },
    role_id: { type: Number },
    ord: { type: Number }, // in what order to apply this rule
  });
}


module.exports = {
  start: start,
  getAllUsers: (cb) => {
    return userRoleModel.all({ order: 'ord' }, cb);
  },
}
