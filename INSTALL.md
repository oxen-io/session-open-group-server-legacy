# Requirements
- Hosting with a public IP address
- make sure you have a working DNS hostname that points to your public IP address. 
- an email address (LetsEncrypt requires this)
- We recommend you have at least 4GB of free disk space and 512mb of ram (it may runs with less but use at your own risk)

# Installation

## 1. Install docker (debian)
for non-debian-based installation instructions of Docker: https://docs.docker.com/v17.12/install/#server

Use this guide for additional troubleshooting help: https://docs.docker.com/v17.12/install/linux/docker-ce/debian/#set-up-the-repository
or https://docs.docker.com/v17.12/install/linux/docker-ce/ubuntu/
### remove any possibly previously installed docker installations
`sudo apt-get remove docker docker-engine docker.io`
### install official docker repo
- `sudo apt-get update`
- `sudo apt-get install apt-transport-https ca-certificates curl gnupg2 software-properties-common`
#### For Debian
- `curl -fsSL https://download.docker.com/linux/debian/gpg | sudo apt-key add -`
- `sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian $(lsb_release -cs) stable"`
#### For Ubuntu
- `curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -`
- `sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"`
### install and test docker
- `apt-get update`
- `sudo apt-get install docker-ce`
- To check to make sure it's all working: `docker run hello-world`

## 2. Install docker-compose

### create docker-compose script
`curl -L "https://github.com/docker/compose/releases/download/1.25.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`
### make sure it's executable
`chmod u+x /usr/local/bin/docker-compose`

## 3. Install SOGS
- `git clone https://github.com/loki-project/session-open-group-server.git`
### install SOGS git submodules
- `cd session-open-group-server`
- `git submodule init`
- `git submodule update`
### make sure permissions on acme.json is correct
`chmod 600 docker/acme.json`
### set up config
- `cp loki_template.ini loki.ini`
### Give your Session ID moderator access
- replace PUBKEY with your Session ID and run `echo "PUBKEY=true" >> loki.ini`
### start it
Replace `your@email.tld` with your email address and `yourssl.domain.tld` with your public facing hostname. These are required for getting an SSL certification from LetsEncrypt which we will attempt to automatically do for you.

`EMAIL=your@email.tld DOMAIN=yourssl.domain.tld docker-compose up -d`

# Upgrade instruction
- make sure you're in the `loki-messenger-public-server` directory
- `EMAIL=your@email.tld DOMAIN=yourssl.domain.tld docker-compose down` to stop it from running
- `git pull` to grab the latest source and configs
- `git submodule init` to grab any submodule changes
- `git submodule update` to grab any platform/nodepomf changes
- `EMAIL=your@email.tld DOMAIN=yourssl.domain.tld docker-compose build` to update the local docker images
- `EMAIL=your@email.tld DOMAIN=yourssl.domain.tld docker-compose up -d` to restart the server
