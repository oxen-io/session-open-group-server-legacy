# Session Open Group Server
Session Open Group Server (previously Loki messenger public chat server)

an Express REST API for serving/storing open group room history for Session. 

## Requirements:
- Hosting with a public IP address
- make sure you have a working DNS hostname that points to your public IP address. 
- an email address (LetsEncrypt requires this)
- We recommend you have at least 4GB of free disk space and 512mb of ram (it may runs with less but use at your own risk)

### Software requirements:
- NodeJS 8.x+
- A storage engine supported by [camintejs](https://github.com/biggora/caminte) for persistence
  - Recommended: Mysql/MariaDB
  - Suggested: MySQL/MariaDB, SQLite3, PostgresQL, Redis
  - Possible: Mongo, CouchDB, Neo4j, Cassandra, Riak, Firebird, TingoDB, RethikDB, ArangoDB

## Installation

[INSTALL.md](INSTALL.md) contains the current installation instructions.

Check our [docs.loki.network](https://docs.loki.network/LokiServices/Messenger/public_channel_setup/) for complete walkthru

Our [Wiki](https://github.com/loki-project/session-open-group-server/wiki) also contains non-docker-based instructions 

(Advanced configuration instructions coming soon...)
