// Local stand-in for the Hello /v1 API (shapes from backend/docs/swagger.yaml). Dev/test only.
import http from 'node:http';

const PORT = Number(process.env.PORT || 4010);
const KEY = 'test_key_local_only';
const N8N_LOCAL = process.env.N8N_LOCAL || 'http://127.0.0.1:5678';
const N8N_PUBLIC_HOST = process.env.N8N_PUBLIC_HOST || 'n8n.local.test';
const numbers = [
	{ phone_number_id: '111', waba_id: 'W1', display_phone_number: '+1 555-0111', verified_name: 'Shop A', can_send: true, status: 'active' },
	{ phone_number_id: '222', waba_id: 'W1', display_phone_number: '+1 555-0222', verified_name: 'Shop B', can_send: true, status: 'active' },
];
const templates = Array.from({ length: 130 }, (_, i) => ({
	id: `T${i}`, name: `tpl_${String(i).padStart(3, '0')}`, language: 'en_US', category: 'UTILITY', status: 'APPROVED', components: [],
}));
const overrides = {}; // phone_number_id -> {url, verify_token}
const log = [];
const sink = [];

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const err = (res, code, message, hello_code) => json(res, code, { error: { message, type: 'OAuthException', code, error_data: { hello_code }, fbtrace_id: 'x' } });

http.createServer(async (req, res) => {
	const chunks = []; for await (const c of req) chunks.push(c);
	const raw = Buffer.concat(chunks);
	const u = new URL(req.url, 'http://x');
	const ctype = req.headers['content-type'] || '';
	const entry = { method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), auth: req.headers.authorization, ctype, idem: req.headers['idempotency-key'] };
	if (ctype.includes('json')) { try { entry.body = JSON.parse(raw.toString()); } catch { entry.body = raw.toString(); } }
	else if (ctype.includes('multipart')) entry.multipart = raw.toString('latin1').replace(/\r/g, '').split('\n').filter((l) => l.startsWith('Content-Disposition') || l.startsWith('Content-Type') || (l && l.length < 40 && !l.startsWith('--'))).slice(0, 12);

	if (u.pathname.startsWith('/__')) {
		if (u.pathname === '/__log') return json(res, 200, log);
		if (u.pathname === '/__sink') return json(res, 200, sink);
		if (u.pathname === '/__reset') { log.length = 0; sink.length = 0; return json(res, 200, {}); }
		if (u.pathname.startsWith('/__sink/')) { sink.push({ wf: u.pathname.slice(8), body: entry.body }); return json(res, 200, {}); }
		return json(res, 404, {});
	}
	log.push(entry);
	if (req.headers.authorization !== `Bearer ${KEY}`) return err(res, 401, 'Invalid API key', 'UNAUTHORIZED');

	let m;
	if (req.method === 'GET' && u.pathname === '/v1/phone_numbers') return json(res, 200, { data: numbers });
	if (req.method === 'GET' && (m = u.pathname.match(/^\/v1\/([^/]+)\/message_templates$/))) {
		const limit = Number(u.searchParams.get('limit') || 25); const after = Number(u.searchParams.get('after') || 0);
		let list = templates;
		const s = u.searchParams.get('search'); if (s) list = list.filter((t) => t.name.includes(s));
		const slice = list.slice(after, after + limit); const next = after + limit < list.length;
		return json(res, 200, { data: slice, paging: { cursors: { after: String(after + limit) }, ...(next ? { next: 'more' } : {}) } });
	}
	if (req.method === 'POST' && (m = u.pathname.match(/^\/v1\/([^/]+)\/messages$/))) {
		return json(res, 200, { messaging_product: 'whatsapp', contacts: [{ input: entry.body?.to, wa_id: String(entry.body?.to).slice(1) }], messages: [{ id: 'wamid.MOCK' + log.length, message_status: 'accepted' }], hello_id: 'hid-' + log.length });
	}
	if (req.method === 'POST' && (m = u.pathname.match(/^\/v1\/([^/]+)\/media$/))) {
		if (!ctype.includes('multipart/form-data')) return err(res, 400, 'MISSING_FILE', 'MISSING_FILE');
		return json(res, 200, { id: 'MEDIA-' + raw.length });
	}
	if ((m = u.pathname.match(/^\/v1\/([^/]+)\/webhook-override$/))) {
		const pn = m[1];
		if (!numbers.find((n) => n.phone_number_id === pn)) return err(res, 404, 'Account not found', 'ACCOUNT_NOT_FOUND');
		if (req.method === 'GET') { const o = overrides[pn]; return json(res, 200, o ? { enabled: true, url: o.url, status: 'active', plan_allows: true } : { enabled: false, plan_allows: true }); }
		if (req.method === 'DELETE') { delete overrides[pn]; res.writeHead(204); return res.end(); }
		if (req.method === 'PUT') {
			const b = entry.body || {};
			if (b.acknowledge_no_tracking !== true) return json(res, 400, { message: 'acknowledge_no_tracking must be true', code: 'VALIDATION_ERROR' });
			if (!/^https:\/\//.test(b.url || '') || b.url.length > 200) return json(res, 400, { message: 'invalid url', code: 'VALIDATION_ERROR' });
			if (!b.verify_token || b.verify_token.length < 8 || b.verify_token.length > 100) return json(res, 400, { message: 'verify_token must be 8-100 characters', code: 'VALIDATION_ERROR' });
			// Meta-style synchronous verification: GET url + hub.* params
			const target = new URL(b.url); target.protocol = 'http:';
			const local = new URL(N8N_LOCAL + target.pathname); target.searchParams.forEach((v, k) => local.searchParams.set(k, v));
			if (target.hostname !== N8N_PUBLIC_HOST) return json(res, 400, { message: 'Meta could not verify your URL: host unreachable', code: 'WEBHOOK_VERIFICATION_FAILED' });
			local.searchParams.set('hub.mode', 'subscribe'); local.searchParams.set('hub.verify_token', b.verify_token); local.searchParams.set('hub.challenge', 'CH' + Date.now());
			let ok = false, detail = '';
			try { const r = await fetch(local); const t = await r.text(); ok = r.status === 200 && t === local.searchParams.get('hub.challenge'); detail = `status ${r.status} body ${t.slice(0, 40)}`; } catch (e) { detail = String(e); }
			entry.handshake = { ok, detail }; 
			if (!ok) return json(res, 400, { message: 'Meta could not verify your URL: ' + detail, code: 'WEBHOOK_VERIFICATION_FAILED' });
			overrides[pn] = { url: b.url, verify_token: b.verify_token };
			return json(res, 200, { enabled: true, url: b.url, status: 'active', plan_allows: true });
		}
	}
	return err(res, 404, 'not found ' + u.pathname, 'NOT_FOUND');
}).listen(PORT, '0.0.0.0', () => console.log('mock listening', PORT));
