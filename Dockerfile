# syntax=docker/dockerfile:1
FROM ubuntu:focal

RUN apt-get update

RUN apt-get install curl software-properties-common -y

RUN add-apt-repository ppa:savoury1/ffmpeg4 -y
RUN add-apt-repository ppa:savoury1/graphics -y
RUN add-apt-repository ppa:savoury1/multimedia -y
RUN add-apt-repository ppa:lovell/cgif -y
RUN apt full-upgrade -y

RUN apt-get install python build-essential pkg-config libglib2.0-dev libexpat1-dev libssl-dev imagemagick libimagequant-dev git dnsutils -y

# https://github.com/lovell/sharp/issues/3161
#RUN curl -OL https://github.com/libvips/libvips/releases/download/v8.12.2/vips-8.12.2.tar.gz && tar xf vips-8.12.2.tar.gz
#RUN cd vips-8.12.2 && ./configure && make && make install

RUN curl -fsSL https://deb.nodesource.com/setup_16.x | bash -
RUN apt-get install -y nodejs
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list
RUN apt update
RUN apt install yarn

RUN git clone https://github.com/galtproject/geesome-node.git
WORKDIR "/geesome-node"
RUN yarn
RUN npm rebuild youtube-dl #https://github.com/przemyslawpluta/node-youtube-dl/issues/131

RUN cd frontend && yarn && npm run build

ENV STORAGE_REPO=/root/.jsipfs
ENV STORAGE_HOST=go_ipfs
ENV STORAGE_MODULE=ipfs-http-client