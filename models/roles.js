var roleModel

const start = options => {
  const { schema } = options
  /** role storage model */
  roleModel = schema.define('roles', {
    name: { type: String, length: 64 }
  })
}

module.exports = {
  start: start,
  getRoleIdByName: (name) => {
    return new Promise((resolve, rej) => {
      roleModel.find({ where: { name } }, (err, roles) => {
        if (err) {
          console.error(err)
          return rej(err)
        }
        if (roles.length !== 1) {
          return cb('length ' + roles.length, false)
        }
        //cb(err, roles[0].id)
        resolve(roles[0].id)
      })
    })
  },
  getRoles: (roles) => {
    return roleModel.find({ where: { id: { in: roles }  } })
  }
}
