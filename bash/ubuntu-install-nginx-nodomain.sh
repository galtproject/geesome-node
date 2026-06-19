#!/bin/bash

# Set up nginx for a Geesome node reachable by IP only (no domain, no TLS),
# then run first-admin setup against the node API interactively.
#
# Overridable via env:
#   FRONTEND_DIR  static frontend dist directory (default /var/www/geesome-frontend)
#   API_URL       node API base URL            (default http://127.0.0.1:2052)
#   ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD  skip the matching CLI prompt

FRONTEND_DIR="${FRONTEND_DIR:-/var/www/geesome-frontend}"
API_URL="${API_URL:-http://127.0.0.1:2052}"

# --- nginx ---------------------------------------------------------------
sudo apt-get update -y
sudo apt-get install nginx -y

sudo mkdir -p "$FRONTEND_DIR" || :
sudo chown -R www-data:www-data "$FRONTEND_DIR"
sudo chmod -R 755 "$FRONTEND_DIR"

sudo cp bash/nodomain-nginx.conf /etc/nginx/sites-enabled/default
sudo sed -i -e "s~\%app_dir\%~$FRONTEND_DIR~g" /etc/nginx/sites-enabled/default

sudo nginx -t && sudo service nginx restart

SERVER_IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
printf "\nNginx configured for IP-based access: http://%s/\n" "$SERVER_IP"
printf "Put the built frontend in %s and the API is proxied at http://%s/api/\n\n" "$FRONTEND_DIR" "$SERVER_IP"

# --- first-admin setup ---------------------------------------------------
printf "Waiting for the Geesome node API at %s ...\n" "$API_URL"
isEmpty=""
for _ in $(seq 1 60); do
  isEmpty=$(curl -fsS "$API_URL/v1/is-empty" 2>/dev/null) && break
  sleep 5
done

if [ -z "$isEmpty" ]; then
  printf "\nCould not reach %s/v1/is-empty. Is the node running (systemctl status geesome-docker)?\n" "$API_URL"
  printf "Nginx is ready; re-run this script once the node is up to finish setup.\n"
  exit 1
fi

if [[ "$isEmpty" != *'"result":true'* && "$isEmpty" != *'"result": true'* ]]; then
  printf "\nNode already has users; skipping setup. Open http://%s/ to log in.\n" "$SERVER_IP"
  exit 0
fi

printf "\nThis node is empty. Create the first admin user:\n"
[ -z "$ADMIN_NAME" ] && read -p "Admin username: " ADMIN_NAME
[ -z "$ADMIN_EMAIL" ] && read -p "Admin email: " ADMIN_EMAIL
if [ -z "$ADMIN_PASSWORD" ]; then
  read -s -p "Admin password: " ADMIN_PASSWORD; echo
  read -s -p "Confirm password: " ADMIN_PASSWORD_CONFIRM; echo
  if [ "$ADMIN_PASSWORD" != "$ADMIN_PASSWORD_CONFIRM" ]; then
    printf "Passwords do not match.\n"
    exit 1
  fi
fi

# Build the JSON body safely (handles quotes/special chars in the inputs).
SETUP_BODY=$(ADMIN_NAME="$ADMIN_NAME" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  python3 -c 'import json,os; print(json.dumps({"name":os.environ["ADMIN_NAME"],"email":os.environ["ADMIN_EMAIL"],"password":os.environ["ADMIN_PASSWORD"]}))')

printf "\nCreating admin user...\n"
response=$(curl -fsS -X POST "$API_URL/v1/setup" -H "Content-Type: application/json" -d "$SETUP_BODY" 2>&1)

if [[ "$response" == *'"apiKey"'* ]]; then
  printf "\nSetup complete. Admin user '%s' created.\n" "$ADMIN_NAME"
  printf "Open http://%s/ and log in.\n" "$SERVER_IP"
else
  printf "\nSetup failed. API response:\n%s\n" "$response"
  exit 1
fi
