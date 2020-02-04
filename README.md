# Session Open Group Server
Session Open Group Server (previously Loki messenger public chat server)

an Express REST API for serving/storing open group room history for Session. 

System requirements:
- NodeJS
- A storage engine supported by [camintejs](https://github.com/biggora/caminte) for persistence
  - Recommended: Mysql/MariaDB
  - Suggested: MySQL/MariaDB, SQLite3, PostgresQL, Redis
  - Possible: Mongo, CouchDB, Neo4j, Cassandra, Riak, Firebird, TingoDB, RethikDB, ArangoDB

Check our [docs.loki.network](https://docs.loki.network/LokiServices/Messenger/public_channel_setup/) for complete instruction

Manual (non-docker) set up instructions:
```
git submodule init
git submodule update
cp loki_template.ini loki.ini
# edit loki.ini (set your first moderator key, public_url, database type and credentials)
# edit config.json to set permanent storage backend database type and credentials
npm i -g pm2
npm i
cd nodepomf
npm i
cd ../server
npm i
cd ..
pm2 start overlay_server.js --watch --name "sogs"
```

Manual (non-docker) upgrade instruction:
```
git pull
# handle any git conflicts for loki.ini / config.json
# check loki.ini for anything you may need to update
# check config.json for anything you may need to update
git submodule update
npm i
cd nodepomf
npm i
cd ../server
npm i
pm2 restart sogs
```

### Popular linux distribution instructions to install NodeJS

Ubuntu NodeJS installation:

`curl -sL https://deb.nodesource.com/setup_12.x | sudo bash -`

then

`sudo apt-get install -y nodejs`
