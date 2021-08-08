#!/bin/bash

docker-compose down --rmi all && docker-compose build --no-cache && mkdir -p .docker-data