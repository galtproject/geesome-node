#!/bin/bash

sudo echo "Port $PORT" >> /etc/ssh/sshd_config
sudo systemctl restart sshd