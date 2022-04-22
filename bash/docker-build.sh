#!/bin/bash

docker rmi --f geesome-node_web && docker-compose build --no-cache && mkdir -p .docker-data