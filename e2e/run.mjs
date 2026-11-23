// End-to-end driver: n8n (docker, port 5678) + mock Hello API (host, port 4010). Prints PASS/FAIL lines.
const N8N = 'http://localhost:5678', MOCK = 'http://localhost:4010';
const API_KEY = 'test_key_local_only';
let cookie = '';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(method, path, body) {
	const r = await fetch(N8N + '/rest' + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
	const sc = r.headers.getSetCookie?.(); if (sc?.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
	const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
	if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${t.slice(0, 300)}`);
	return j.data ?? j;
}
const mockLog = async () => (await fetch(MOCK + '/__log')).json();
const sinkItems = async (wf) => (await (await fetch(MOCK + '/__sink')).json()).filter((s) => s.wf === wf).map((s) => s.body);

// ---- login
await rest('POST', '/login', { emailOrLdapLoginId: 'e2e@example.com', password: 'E2eTest12345' });
await fetch(MOCK + '/__reset');

// ---- credential + credential test
const credData = { apiKey: API_KEY, baseUrl: 'http://host.docker.internal:4010' };
const cred = await rest('POST', '/credentials', { name: 'Hello e2e', type: 'helloApi', data: credData });
let t;
try { t = await rest('POST', '/credentials/test', { credentials: { id: cred.id, name: 'Hello e2e', type: 'helloApi', data: credData } }); } catch (e) { t = { status: 'Error', message: String(e) }; }
check('credential test (GET /v1/phone_numbers) passes', t.status === 'OK', JSON.stringify(t).slice(0, 150));
let log = await mockLog();
check('credential test hit mock with Bearer key', log.some((e) => e.path === '/v1/phone_numbers' && e.auth === `Bearer ${API_KEY}`));
const badData = { apiKey: 'wrong', baseUrl: credData.baseUrl };
const badCred = await rest('POST', '/credentials', { name: 'Hello bad', type: 'helloApi', data: badData });
const bad = await rest('POST', '/credentials/test', { credentials: { id: badCred.id, name: 'Hello bad', type: 'helloApi', data: badData } }).catch((e) => ({ status: 'Error', message: String(e) }));
check('credential test fails for a wrong key', bad.status !== 'OK', JSON.stringify(bad).slice(0, 120));

const credRef = { helloApi: { id: cred.id, name: 'Hello e2e' } };
const pos = (i) => [260 + (i % 4) * 220, 100 + Math.floor(i / 4) * 160];
const hello = (name, i, parameters) => ({ id: 'n' + i, name, type: 'CUSTOM.hello', typeVersion: 1, position: pos(i), parameters, credentials: credRef });

async function createAndActivate(name, nodes, connections) {
	const wf = await rest('POST', '/workflows', { name, nodes, connections, settings: {} });
	await rest('POST', `/workflows/${wf.id}/activate`, { versionId: wf.versionId });
	return wf;
}

// ---- action workflow (webhook-started)
const names = []; const nodes = [{ id: 'w', name: 'Start', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: 'e2e-actions', parameters: { path: 'e2e-actions', httpMethod: 'GET', responseMode: 'onReceived' } }];
const add = (name, params) => { names.push(name); nodes.push(hello(name, nodes.length, { phoneNumberId: '111', ...params })); };
add('text', { resource: 'message', operation: 'sendText', to: '+1 (650) 555-1234', text: 'hello there', previewUrl: true, options: { idempotencyKey: 'idem-1', replyTo: 'wamid.ORIG' } });
add('template', { resource: 'message', operation: 'sendTemplate', to: '+16505551234', template: 'order_update::en_US', headerType: 'document', headerMediaSource: 'link', headerMedia: 'https://files.example.com/inv.pdf', headerFilename: 'inv.pdf', bodyParameters: { parameters: [{ value: 'Asha' }, { value: '#42' }] }, buttonParameters: { buttons: [{ index: 0, subType: 'url', value: 'orders/42' }] } });
add('media-link', { resource: 'message', operation: 'sendMedia', to: '+16505551234', mediaType: 'image', mediaSource: 'link', media: 'https://files.example.com/a.png', caption: 'pic' });
add('media-id', { resource: 'message', operation: 'sendMedia', to: '+16505551234', mediaType: 'document', mediaSource: 'id', media: 'MEDIA-9', filename: 'f.pdf', caption: 'doc' });
add('buttons', { resource: 'message', operation: 'sendInteractiveButtons', to: '+16505551234', interactiveBody: 'Confirm?', interactiveHeader: 'H', interactiveFooter: 'F', buttons: { items: [{ id: 'yes', title: 'Yes' }, { id: 'no', title: 'No' }] } });
add('list', { resource: 'message', operation: 'sendInteractiveList', to: '+16505551234', interactiveBody: 'Pick', listButton: 'Open', sections: { items: [{ title: 'S1', rows: { items: [{ id: 'a', title: 'A', description: 'da' }, { id: 'b', title: 'B' }] } }] } });
add('numbers', { resource: 'phoneNumber', operation: 'getAll' });
add('templates-all', { resource: 'template', operation: 'getAll', returnAll: true, filters: {} });
add('templates-limit', { resource: 'template', operation: 'getAll', returnAll: false, limit: 3, filters: { search: 'tpl_01' } });
const conns = { Start: { main: [[]] } };
names.forEach((n) => conns.Start.main[0].push({ node: n, type: 'main', index: 0 }));
// upload: Code node makes binary, then upload
nodes.push({ id: 'c', name: 'make-file', type: 'n8n-nodes-base.code', typeVersion: 2, position: [0, 300], parameters: { jsCode: "return [{ json: {}, binary: { data: await this.helpers.prepareBinaryData(Buffer.from('hello file'), 'a.txt', 'text/plain') } }];" } });
nodes.push(hello('upload', nodes.length, { phoneNumberId: '111', resource: 'media', operation: 'upload', binaryPropertyName: 'data' }));
conns.Start.main[0].push({ node: 'make-file', type: 'main', index: 0 });
conns['make-file'] = { main: [[{ node: 'upload', type: 'main', index: 0 }]] };
const act = await createAndActivate('e2e actions', nodes, conns);
await sleep(1500);
const hit = await fetch(N8N + '/webhook/e2e-actions'); check('actions workflow webhook accepted', hit.status === 200, String(hit.status));
await sleep(4000);
log = await mockLog();
const post = (p) => log.filter((e) => e.method === 'POST' && e.path === p);
const msgs = post('/v1/111/messages').map((e) => e.body);
const by = (type, pred = () => true) => msgs.find((b) => b.type === type && pred(b));
const tx = by('text'); check('text: body, +normalised to, preview, reply context', tx && tx.to === '+16505551234' && tx.text.body === 'hello there' && tx.text.preview_url === true && tx.context?.message_id === 'wamid.ORIG', JSON.stringify(tx));
check('text: Idempotency-Key header', post('/v1/111/messages').some((e) => e.idem === 'idem-1'));
const tp = by('template'); check('template: name, language, header document, body, url button', tp && tp.template.name === 'order_update' && tp.template.language.code === 'en_US' && JSON.stringify(tp.template.components) === JSON.stringify([{ type: 'header', parameters: [{ type: 'document', document: { link: 'https://files.example.com/inv.pdf', filename: 'inv.pdf' } }] }, { type: 'body', parameters: [{ type: 'text', text: 'Asha' }, { type: 'text', text: '#42' }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'orders/42' }] }]), JSON.stringify(tp));
const im = by('image'); check('media by link (image + caption)', im && im.image.link === 'https://files.example.com/a.png' && im.image.caption === 'pic', JSON.stringify(im));
const dc = by('document'); check('media by id (document + filename)', dc && dc.document.id === 'MEDIA-9' && dc.document.filename === 'f.pdf', JSON.stringify(dc));
const ib = by('interactive', (b) => b.interactive.type === 'button'); check('interactive buttons', ib && ib.interactive.header.text === 'H' && ib.interactive.footer.text === 'F' && ib.interactive.action.buttons.length === 2 && ib.interactive.action.buttons[0].reply.id === 'yes', JSON.stringify(ib));
const il = by('interactive', (b) => b.interactive.type === 'list'); check('interactive list', il && il.interactive.action.button === 'Open' && il.interactive.action.sections[0].rows.length === 2 && il.interactive.action.sections[0].rows[0].description === 'da', JSON.stringify(il));
check('upload: multipart POST /v1/111/media', post('/v1/111/media').some((e) => e.ctype.startsWith('multipart/form-data')), JSON.stringify(post('/v1/111/media')[0]?.multipart));
check('list phone numbers', log.some((e) => e.path === '/v1/phone_numbers' && e.auth));
const tl = log.filter((e) => e.path === '/v1/W1/message_templates');
check('templates: waba resolved + paginated all (>=2 pages, after cursor)', tl.length === 3 && tl.some((e) => e.query.after === '100'), `${tl.length} calls`);
check('templates: limit 3 + search filter', tl.some((e) => e.query.limit === '3' && e.query.search === 'tpl_01'));
// results as seen by n8n
const execs = await rest('GET', `/executions?workflowId=${act.id}&limit=5`).catch(() => null);
const ex = execs?.results?.[0] ?? execs?.[0];
check('actions workflow execution succeeded in n8n', ex && ex.status === 'success', ex ? ex.status : 'no execution');

// ---- trigger workflows
const trig = (name, pn, events, wfKey, i) => ({
	nodes: [
		{ id: 't', name: 'Hello Trigger', type: 'CUSTOM.helloTrigger', typeVersion: 1, position: [0, 0], webhookId: 'e2e-trig-' + wfKey, parameters: { phoneNumberId: pn, ...(events ? { events } : {}) }, credentials: credRef },
		{ id: 'h', name: 'Sink', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [300, 0], parameters: { method: 'POST', url: 'http://host.docker.internal:4010/__sink/' + wfKey, sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}' } },
	],
	connections: { 'Hello Trigger': { main: [[{ node: 'Sink', type: 'main', index: 0 }]] } },
});
await fetch(MOCK + '/__reset');
const A = trig('A', '111', null, 'A'), B = trig('B', '222', ['message', 'status', 'echo'], 'B');
const wfA = await createAndActivate('e2e trigger A', A.nodes, A.connections).catch((e) => { check('activate trigger A', false, String(e)); return null; });
const wfB = await createAndActivate('e2e trigger B', B.nodes, B.connections).catch((e) => { check('activate trigger B', false, String(e)); return null; });
await sleep(2000);
log = await mockLog();
const puts = log.filter((e) => e.method === 'PUT');
const putA = puts.find((e) => e.path === '/v1/111/webhook-override'), putB = puts.find((e) => e.path === '/v1/222/webhook-override');
check('activation: GET webhook-override (checkExists) then PUT', log.some((e) => e.method === 'GET' && e.path === '/v1/111/webhook-override') && !!putA);
check('PUT body: https url+token, verify_token, acknowledge_no_tracking', putA && putA.body.acknowledge_no_tracking === true && /^https:\/\/n8n\.local\.test\/webhook\/[^/]+\/webhook\?hello_token=[0-9a-f]{32}$/.test(putA.body.url) && putA.body.verify_token.length >= 8 && putA.body.url.length <= 200, JSON.stringify(putA?.body));
check('verification handshake (hub.challenge) succeeded', putA?.handshake?.ok === true && putB?.handshake?.ok === true, putA?.handshake?.detail);
const local = (hookUrl, extra = '') => { const u = new URL(hookUrl); return `${N8N}${u.pathname}${u.search}${extra}`; };
const meta = (field, pn, value) => ({ object: 'whatsapp_business_account', entry: [{ id: 'W1', changes: [{ field, value: { messaging_product: 'whatsapp', metadata: { phone_number_id: pn, display_phone_number: '15550111' }, ...value } }] }] });
const msg = (pn) => meta('messages', pn, { contacts: [{ wa_id: '16505551234', profile: { name: 'Asha' } }], messages: [{ from: '16505551234', id: 'wamid.IN1', timestamp: '1', type: 'text', text: { body: 'hi bot' } }] });
const stat = (pn) => meta('messages', pn, { statuses: [{ id: 'wamid.OUT1', status: 'delivered', recipient_id: '16505551234', timestamp: '2' }] });
const echo = (pn) => meta('smb_message_echoes', pn, { message_echoes: [{ from: '15550111', to: '16505551234', id: 'wamid.ECHO1', type: 'text', text: { body: 'from app' } }] });
const send = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const urlA = putA?.body.url, urlB = putB?.body.url;
if (urlA && urlB) {
	let r = await send(local(urlA), msg('111')); check('A: message POST accepted (200)', r.status === 200, String(r.status));
	await send(local(urlA), stat('111')); await send(local(urlA), echo('111')); await send(local(urlA), msg('222'));
	await send(local(urlB), msg('222')); await send(local(urlB), stat('222')); await send(local(urlB), echo('222'));
	await sleep(3500);
	const a = await sinkItems('A'), b = await sinkItems('B');
	check('A (default filter): only the message, no status/echo/other-number', a.length === 1 && a[0].event === 'message' && a[0].contact_name === 'Asha' && a[0].message.text.body === 'hi bot', JSON.stringify(a.map((x) => x.event)));
	check('B (all events): message + status + echo', b.length === 3 && ['message', 'status', 'echo'].every((k) => b.some((x) => x.event === k)), JSON.stringify(b.map((x) => x.event)));
	r = await send(urlA.replace('https://n8n.local.test', N8N).replace(/hello_token=[0-9a-f]+/, 'hello_token=deadbeef'), msg('111')); check('POST with wrong token rejected (401)', r.status === 401, String(r.status));
	r = await send(urlA.replace('https://n8n.local.test', N8N).replace(/\?hello_token=[0-9a-f]+/, ''), msg('111')); check('POST without token rejected (401)', r.status === 401, String(r.status));
	await sleep(800); check('rejected POSTs produced no items', (await sinkItems('A')).length === 1);
	const vt = putA.body.verify_token;
	const base = local(urlA, '&hub.mode=subscribe&hub.challenge=777');
	r = await fetch(base + '&hub.verify_token=' + vt); check('GET handshake with right verify token echoes challenge', r.status === 200 && (await r.text()) === '777');
	r = await fetch(base + '&hub.verify_token=wrongwrong'); check('GET handshake with wrong verify token rejected (403)', r.status === 403, String(r.status));
}
// ---- deactivation
await fetch(MOCK + '/__reset');
for (const wf of [wfA, wfB].filter(Boolean)) await rest('POST', `/workflows/${wf.id}/deactivate`, {}).catch((e) => check('deactivate', false, String(e)));
await sleep(1500);
log = await mockLog();
check('deactivation: DELETE webhook-override for both numbers', log.some((e) => e.method === 'DELETE' && e.path === '/v1/111/webhook-override') && log.some((e) => e.method === 'DELETE' && e.path === '/v1/222/webhook-override'), JSON.stringify(log.map((e) => e.method + ' ' + e.path)));
for (const wf of [act, wfA, wfB].filter(Boolean)) await rest('POST', `/workflows/${wf.id}/deactivate`, {}).catch(() => {});
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
