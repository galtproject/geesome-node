#!/bin/bash

if [ ! -z "$STORAGE_REPO" ] && [ ! -d "$STORAGE_REPO" ] 
then
    echo "STORAGE_REPO Directory $STORAGE_REPO DOES NOT exists." 
    exit 1
fi

bash/ubuntu-install-deps.sh
bash/init-app.sh
bash/ubuntu-install-nginx.sh
