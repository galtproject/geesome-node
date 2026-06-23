# syntax=docker/dockerfile:1.7
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

WORKDIR "/geesome-node"
RUN npm i -g yarn@1.22.22

ENV YARN_CACHE_FOLDER=/usr/local/share/.cache/yarn
ENV NODE_OPTIONS=--dns-result-order=ipv4first

COPY package.json yarn.lock .yarnrc ./
# Keep dependency installation reusable for source-only rebuilds. The Yarn v1
# cache mount preserves fetched package archives between BuildKit builds, while
# --network-concurrency 1 avoids the tar extraction race seen on small servers.
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn -W --no-optional --frozen-lockfile --network-concurrency 1 \
    && npm rebuild youtube-dl

COPY . .

ENV STORAGE_MODULE=ipfs-http-client
ENV STORAGE_URL=http://go_ipfs:5001
