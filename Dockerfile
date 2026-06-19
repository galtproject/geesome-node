# syntax=docker/dockerfile:1
FROM microwavedev/geesome-base

# https://github.com/lovell/sharp/issues/3161
#RUN curl -OL https://github.com/libvips/libvips/releases/download/v8.12.2/vips-8.12.2.tar.gz && tar xf vips-8.12.2.tar.gz
#RUN cd vips-8.12.2 && ./configure && make && make install

RUN mkdir /usr/local/nvm
ENV NVM_DIR /usr/local/nvm
# https://github.com/nodejs/node/issues/46221
ENV NODE_VERSION 22.21.1

RUN curl --silent -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
RUN \. $NVM_DIR/nvm.sh
ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN npm i -g yarn

COPY . /geesome-node
WORKDIR "/geesome-node"
#RUN git checkout improve
# yarn v1 corrupts its own cache when parallel tar extraction races (a
# different package fails "appears to be corrupt" on each run, often when the
# droplet runs low on memory mid-extract). Clean the inherited cache and
# serialize fetch+extract with --network-concurrency 1 to avoid the race.
RUN yarn cache clean && yarn -W --no-optional --network-concurrency 1
RUN npm rebuild youtube-dl #https://github.com/przemyslawpluta/node-youtube-dl/issues/131

ENV STORAGE_MODULE=ipfs-http-client
ENV STORAGE_URL=http://go_ipfs:5001
