# loki-messenger-public-server
Loki Messenger public chat server

an express REST API for serving persistence history public chat rooms for Loki Messenger. It's run by 2 daemons, the platform servers providing an ADN standard REST API and another with Loki Messenger specific behaviors (crypto-key registration and enhanced moderation functions).

System requirements:
- NodeJS
- A storage engine supported by [camintejs](https://github.com/biggora/caminte) for persistence
  - Recommended: MySQL/MariaDB, SQLite3, PostgresQL, Redis
  - Possible: Mongo, CouchDB, Neo4j, Cassandra, Riak, Firebird, TingoDB, RethikDB, ArangoDB
- A pomf compatible service for attachments

Check our Wiki for complete instruction

Manual set up instructions (without attachment support) may look like:
```
git submodule init
git submodule update
cp loki_template.ini loki.ini
# edit loki.ini
npm i -g pm2
npm i
pm2 start overlay_server.js --watch --name "overlay"
cd server
npm i
cp config.sample.json config.json
# edit config.json
pm2 start app.js --watch --name "platform"
```
