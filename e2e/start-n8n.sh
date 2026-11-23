#!/bin/sh
# Starts n8n in Docker with the staged package as a custom extension.
set -e
STAGE="${E2E_STAGE:-$HOME/.cache/n8n-nodes-hello-e2e}"
cd "$(dirname "$0")"
mkdir -p "$STAGE/n8n-data" && chmod 777 "$STAGE/n8n-data"
docker rm -f n8n-hello-e2e >/dev/null 2>&1 || true
docker run -d --name n8n-hello-e2e -p 5678:5678 --add-host=host.docker.internal:host-gateway \
  -e N8N_CUSTOM_EXTENSIONS=/home/node/.n8n/custom -e N8N_DIAGNOSTICS_ENABLED=false \
  -e WEBHOOK_URL=https://n8n.local.test/ -e N8N_SECURE_COOKIE=false \
  -v "$STAGE/n8n-data:/home/node/.n8n" \
  -v "$STAGE/custom/n8n-nodes-hello:/home/node/.n8n/custom/n8n-nodes-hello:ro" \
  docker.n8n.io/n8nio/n8n:latest
for i in $(seq 1 60); do curl -sf localhost:5678/healthz >/dev/null && break; sleep 2; done
echo "n8n up"
