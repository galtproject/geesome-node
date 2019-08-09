#!/bin/bash

pm2 stop geesome-node
git pull
yarn

# frontend
( cd frontend && yarn && npm run dev-build )

# backend
npm run migrate-database
pm2 start geesome-node
