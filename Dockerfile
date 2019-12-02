FROM node:12
RUN npm i -g pm2

WORKDIR /usr/src/app

COPY *.js /usr/src/app/
COPY package.json /usr/src/app/package.json
COPY package-lock.json /usr/src/app/package-lock.json
COPY dialects/ dialects/
COPY logic/ logic/
COPY models/ models/
COPY test/ test/

RUN npm i
COPY loki_template.ini loki.ini

# we do need proxy-admin
COPY server/ server/
# RUN git submodule update --init --recursive
WORKDIR /usr/src/app/server
RUN npm i
WORKDIR /usr/src/app

EXPOSE 8080
ENTRYPOINT ["pm2-runtime", "overlay_server.js"]
