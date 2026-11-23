#!/bin/sh
# Stages the built package as an n8n custom extension: "$STAGE"/custom/n8n-nodes-hello
set -e
STAGE="${E2E_STAGE:-$HOME/.cache/n8n-nodes-hello-e2e}"
cd "$(dirname "$0")/.."
rm -rf "$STAGE"/custom
mkdir -p "$STAGE"/custom/n8n-nodes-hello
cp package.json "$STAGE"/custom/n8n-nodes-hello/
cp -R dist "$STAGE"/custom/n8n-nodes-hello/dist
echo "staged: $(find "$STAGE"/custom -name '*.node.js' -o -name '*.credentials.js' | tr '\n' ' ')"
