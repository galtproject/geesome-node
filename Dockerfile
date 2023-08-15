# syntax=docker/dockerfile:1
FROM ubuntu:focal

RUN apt-get update

RUN apt-get install curl software-properties-common -y

RUN add-apt-repository ppa:savoury1/ffmpeg4 -y
RUN add-apt-repository ppa:savoury1/graphics -y
RUN add-apt-repository ppa:savoury1/multimedia -y
RUN add-apt-repository ppa:lovell/cgif -y
RUN apt full-upgrade -y

RUN apt-get install python build-essential pkg-config libglib2.0-dev libexpat1-dev libssl-dev libcgif-dev imagemagick libimagequant-dev ffmpeg git dnsutils -y

# https://github.com/lovell/sharp/issues/3161
#RUN curl -OL https://github.com/libvips/libvips/releases/download/v8.12.2/vips-8.12.2.tar.gz && tar xf vips-8.12.2.tar.gz
#RUN cd vips-8.12.2 && ./configure && make && make install

RUN mkdir /usr/local/nvm
ENV NVM_DIR /usr/local/nvm
# https://github.com/nodejs/node/issues/46221
ENV NODE_VERSION 18.12.1

RUN curl --silent -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.4/install.sh | bash
RUN \. $NVM_DIR/nvm.sh
ENV NODE_PATH $NVM_DIR/v$NODE_VERSION/lib/node_modules
ENV PATH $NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH

RUN npm i -g yarn

RUN git clone https://github.com/galtproject/geesome-node.git
WORKDIR "/geesome-node"
#RUN git checkout improve
RUN yarn -W --no-optional
RUN npm rebuild youtube-dl #https://github.com/przemyslawpluta/node-youtube-dl/issues/131

ENV STORAGE_MODULE=ipfs-http-client
ENV STORAGE_URL=http://go_ipfs:5001