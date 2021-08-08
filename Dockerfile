# syntax=docker/dockerfile:1
FROM ubuntu:bionic

RUN apt-get update

RUN apt-get install curl software-properties-common -y

RUN add-apt-repository ppa:jonathonf/ffmpeg-4 -y
RUN apt-get update

RUN apt-get install python build-essential libssl-dev ffmpeg git -y

RUN curl -sL https://deb.nodesource.com/setup_14.x | bash -
RUN apt-get install nodejs -y

RUN npm i -g yarn

RUN git clone https://github.com/galtproject/geesome-node.git
WORKDIR "/geesome-node"
RUN yarn
RUN npm rebuild youtube-dl #https://github.com/przemyslawpluta/node-youtube-dl/issues/131

RUN cd frontend && yarn && npm run dev-build

ENV STORAGE_REPO=/root/.jsipfs
ENV STORAGE_HOST=go_ipfs
ENV STORAGE_MODULE=ipfs-http-client