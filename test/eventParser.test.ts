import { describe, expect, it } from 'vitest';

import { parseEvents } from '../nodes/HelloTrigger/eventParser';
import { safeEqual, withToken } from '../nodes/HelloTrigger/webhookOverride';

const meta = (field: string, value: Record<string, unknown>) => ({
	object: 'whatsapp_business_account',
	entry: [{ id: 'waba1', changes: [{ field, value: { metadata: { phone_number_id: 'PN1', display_phone_number: '+1555' }, ...value } }] }],
});
const message = meta('messages', {
	contacts: [{ wa_id: '15550009', profile: { name: 'Asha' } }],
	messages: [{ from: '15550009', id: 'wamid.1', type: 'text', text: { body: 'hi' } }],
});
const status = meta('messages', { statuses: [{ id: 'wamid.2', status: 'delivered', recipient_id: '15550009' }] });
const echo = meta('smb_message_echoes', { message_echoes: [{ from: '1555', to: '15550009', id: 'wamid.3', type: 'text' }] });

describe('parseEvents', () => {
	it('emits only messages by default kinds', () => {
		expect(parseEvents(message, { kinds: ['message'] })).toHaveLength(1);
		expect(parseEvents(status, { kinds: ['message'] })).toHaveLength(0);
		expect(parseEvents(echo, { kinds: ['message'] })).toHaveLength(0);
	});
	it('maps each kind', () => {
		expect(parseEvents(message, { kinds: ['message'] })[0]).toMatchObject({ event: 'message', from: '15550009', contact_name: 'Asha', type: 'text' });
		expect(parseEvents(status, { kinds: ['status'] })[0]).toMatchObject({ event: 'status', status: 'delivered', message_id: 'wamid.2' });
		expect(parseEvents(echo, { kinds: ['echo'] })[0]).toMatchObject({ event: 'echo', to: '15550009' });
	});
	it('filters other phone numbers and tolerates junk', () => {
		expect(parseEvents(message, { kinds: ['message'], phoneNumberId: 'OTHER' })).toHaveLength(0);
		expect(parseEvents(undefined, { kinds: ['message'] })).toEqual([]);
		expect(parseEvents({ entry: [{ changes: [{ field: 'x' }] }] }, { kinds: ['message', 'status', 'echo'] })).toEqual([]);
	});
});

describe('token helpers', () => {
	it('appends token and compares safely', () => {
		expect(withToken('https://h/webhook/1/webhook', 'abc')).toBe('https://h/webhook/1/webhook?hello_token=abc');
		expect(safeEqual('abc', 'abc')).toBe(true);
		expect(safeEqual('abc', 'abd')).toBe(false);
		expect(safeEqual(undefined, 'abc')).toBe(false);
		expect(safeEqual('', '')).toBe(false);
	});
});
