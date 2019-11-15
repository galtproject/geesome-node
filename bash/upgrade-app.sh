#!/bin/bash

pm2 stop geesome-node
git checkout -- .
git pull
yarn

# frontend
( cd frontend && yarn && npm run dev-build )

# backend
npm run migrate-database
npm rebuild youtube-dl #https://github.com/przemyslawpluta/node-youtube-dl/issues/131
pm2 start geesome-node
