FROM node:12
RUN npm i -g pm2

WORKDIR /usr/src/app

COPY package.json /usr/src/app/package.json
COPY package-lock.json /usr/src/app/package-lock.json
RUN npm ci

COPY *.js /usr/src/app/
COPY dialects/ dialects/
COPY logic/ logic/
COPY models/ models/
COPY test/ test/

# set up nodepomf
COPY nodepomf/ nodepomf/
WORKDIR /usr/src/app/nodepomf
RUN npm ci
RUN npm test
WORKDIR /usr/src/app

# set up platform
COPY server/ server/
WORKDIR /usr/src/app/server
RUN npm ci
RUN npm test

WORKDIR /usr/src/app

COPY config.json config.json
COPY loki_template.ini loki.ini

EXPOSE 8080
ENTRYPOINT ["pm2-runtime", "overlay_server.js"]
