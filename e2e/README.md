# End-to-end test harness (dev only)

Runs the built package inside real n8n (Docker) against a local mock of the Hello `/v1` API.
Never uses a real API key or phone number.

```sh
npm run build && sh e2e/stage.sh        # stage dist as a custom extension
sh e2e/start-n8n.sh                      # n8n on :5678, WEBHOOK_URL=https://n8n.local.test/
curl -X POST localhost:5678/rest/owner/setup -H 'content-type: application/json' \
  -d '{"email":"e2e@example.com","firstName":"E","lastName":"E","password":"E2eTest12345"}'
node e2e/mock-server.mjs &               # mock Hello API on :4010
node e2e/run.mjs                         # prints PASS/FAIL per check
docker rm -f n8n-hello-e2e; pkill -f e2e/mock-server.mjs
```
