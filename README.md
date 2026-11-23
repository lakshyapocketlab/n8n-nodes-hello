# @lakshyapocketlab/n8n-nodes-hello

n8n community nodes for [Hello](https://lakshyapocketlab.com), a WhatsApp Business API provider. Send messages and templates, upload media, list numbers and templates, and start workflows when a WhatsApp number receives a message.

Nodes: **Hello** (actions) and **Hello Trigger**. Zero runtime dependencies.

## Install

Self-hosted n8n: **Settings, Community Nodes, Install**, enter `@lakshyapocketlab/n8n-nodes-hello`. (n8n Cloud once the package is verified.)

## Credentials

Create a **Hello API** credential:

| Field | Value |
|---|---|
| API Key | `hello_live_...` from the Hello dashboard |
| Base URL | `https://helloapi.lakshyapocketlab.com` (default) |

The credential test calls `GET /v1/phone_numbers`.

## Hello node

| Resource | Operation | Notes |
|---|---|---|
| Message | Send Text | Needs an open 24-hour window. Optional link preview. |
| Message | Send Template | Template picked from a dropdown of approved templates (name and language). Header: none, text variable, image, video or document (by link or media ID). Body parameters in order. URL and quick-reply button parameters. |
| Message | Send Media | Image, video, audio, document or sticker, by link or media ID. Caption and file name. |
| Message | Send Interactive Buttons | 1 to 3 reply buttons, optional header and footer. |
| Message | Send Interactive List | Sections and rows. |
| Media | Upload | From a binary field; returns a media ID usable from the same number. |
| Phone Number | Get Many | |
| Template | Get Many | Pages through all results, or a limit; filter by status, category, language, name. |

All send operations take **Options**: *Idempotency Key* (sent as `Idempotency-Key` so a retried execution does not send twice) and *Reply to Message ID*. Recipients use the international format (`+16505551234`); spaces and dashes are stripped. Free-form messages (everything except templates) need an open 24-hour customer service window; WhatsApp enforces it. The node supports Continue On Fail and can be used as an AI tool.

Phone number and template dropdowns load from your account. You can also enter an expression; for a template name in an expression, set the **Language Code** field.

## Hello Trigger

Starts a workflow for events on one WhatsApp number. Choose which **Events** start it:

- **Incoming Message** (default)
- **Status Update** (sent, delivered, read, failed), off by default
- **Coexistence Echo** (messages sent from the WhatsApp Business app on the same number), off by default

Each event becomes one item with an `event` field (`message`, `status` or `echo`), `phone_number_id`, `from`/`to`, `contact_name`, `type` and the raw `message` (or `statusDetails`). Events for other numbers are dropped. Echoes and statuses being off by default keeps auto-reply bots from replying to themselves.

### How it works and the trade-off

The trigger uses Hello's **direct webhook** API (`/v1/{phone_number_id}/webhook-override`). When the workflow is activated, n8n registers its webhook URL for that number; on deactivation it removes it. This has consequences:

- **While active, WhatsApp sends the number's messages, statuses and pricing only to n8n.** The Hello inbox and delivery statistics stop for that number. Deactivate the workflow and Hello tracking resumes.
- Needs the plan feature `webhook_override` (otherwise activation fails with a 403 from Hello).
- Your n8n must be reachable at a **public HTTPS URL** (set `WEBHOOK_URL` on self-hosted n8n; the full URL including token must be 200 characters or fewer).
- Use one trigger per number. Do not use "Listen for test event" while the production workflow is active: test mode registers a different URL and releases the number when it ends.
- If the number's webhook was changed by someone else since activation, deactivating the workflow leaves it alone.

### Security: where the secret token lives

Meta signs deliveries with Hello's app secret, which is not shared with you, so deliveries are authenticated by a secret in the URL instead. The trigger generates a random 128-bit token on activation and appends it to the webhook URL as a **query parameter** (`?hello_token=...`); a POST without the exact token gets 401. A query parameter was chosen over a path segment because n8n fixes each node's webhook path (a dynamic segment would break `checkExists` matching and test URLs), and Hello and Meta keep the query string byte for byte. Treat n8n's execution logs and reverse-proxy access logs as sensitive for that reason.

The Meta verification handshake (`hub.challenge`) is checked against a verify token derived from your API key and the phone number (HMAC-SHA256, never stored). It cannot be random-and-stored because Meta verifies the URL while n8n is still activating, before n8n has saved the node's data.

All Hello calls the trigger makes live in `nodes/HelloTrigger/webhookOverride.ts`, so moving to Hello-side event forwarding later is a one-file change.

## Example workflows

Import from [`examples/`](examples) (select your credential and phone number afterward):

- [`order-update-template.json`](examples/order-update-template.json): a webhook receives an order event and sends an approved `order_update` template with name, order ID and status; an idempotency key prevents duplicates.
- [`auto-reply-bot.json`](examples/auto-reply-bot.json): Hello Trigger (messages only, echoes ignored) replies to text messages, quoting the original.

## Development

```sh
npm install
npm run build
npm run lint
npm test            # unit tests (vitest)
```

End-to-end tests against real n8n in Docker and a mock Hello API: see [`e2e/README.md`](e2e/README.md).

Releases are published from GitHub Actions with npm provenance (`.github/workflows/publish.yml`) on a version tag.

## License

[MIT](LICENSE)
