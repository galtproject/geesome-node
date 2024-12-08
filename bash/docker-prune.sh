#!/bin/bash

docker system prune -af && docker volume ls -qf dangling=true | xargs -r docker volume rm
