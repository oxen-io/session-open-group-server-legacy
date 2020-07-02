module.exports = (app, prefix) => {
  app.get(prefix + '/loki/v1/time', (req, res) => {
    res.end(""+parseInt(Date.now()/1000));
  });
}
