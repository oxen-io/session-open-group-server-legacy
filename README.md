# loki-messenger-public-server
Loki Messenger public chat server

an Express REST API for serving persistence history public chat rooms for Loki Messenger. 

System requirements:
- NodeJS
- A storage engine supported by [camintejs](https://github.com/biggora/caminte) for persistence
  - Recommended: MySQL/MariaDB, SQLite3, PostgresQL, Redis
  - Possible: Mongo, CouchDB, Neo4j, Cassandra, Riak, Firebird, TingoDB, RethikDB, ArangoDB

Check our [docs.loki.network](https://docs.loki.network/LokiServices/Messenger/public_channel_setup/) for complete instruction

Manual set up instructions (without attachment support) may look like:
```
git submodule init
git submodule update
cp loki_template.ini loki.ini
# edit loki.ini (set your first moderator key)
# could edit config.json if you wanted but most people don't need to touch it
npm i -g pm2
npm i
cd nodepomf
npm i
cd ../server
npm i
cd ..
pm2 start overlay_server.js --watch --name "lmps"
```

# Popular linux distribution instructions to install NodeJS

Ubuntu NodeJS installation:

`curl -sL https://deb.nodesource.com/setup_12.x | sudo bash -`

then

`sudo apt-get install -y nodejs`
