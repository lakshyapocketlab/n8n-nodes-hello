import { describe, expect, it } from 'vitest';

import {
	buildInteractiveButtons,
	buildInteractiveList,
	buildMedia,
	buildTemplate,
	buildText,
	parseTemplate,
} from '../nodes/Hello/messageBuilders';

describe('messageBuilders', () => {
	it('builds a text message with reply context', () => {
		expect(buildText('+15550001', 'hi', true, { replyTo: 'wamid.X' })).toEqual({
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			to: '+15550001',
			type: 'text',
			context: { message_id: 'wamid.X' },
			text: { body: 'hi', preview_url: true },
		});
	});

	it('parses dropdown and bare template values', () => {
		expect(parseTemplate('order_shipped::en_US')).toEqual({ name: 'order_shipped', language: 'en_US' });
		expect(parseTemplate('order_shipped', 'pt_BR')).toEqual({ name: 'order_shipped', language: 'pt_BR' });
		expect(parseTemplate('order_shipped')).toEqual({ name: 'order_shipped', language: '' });
	});

	it('builds a template with document header, body and button parameters', () => {
		const body = buildTemplate('+15550001', {
			template: 'invoice::en',
			headerType: 'document',
			headerMediaSource: 'link',
			headerMedia: 'https://x.test/a.pdf',
			headerFilename: 'a.pdf',
			bodyValues: ['Asha', '42'],
			buttons: [{ index: 0, subType: 'url', value: 'order/42' }],
		});
		expect(body.template).toEqual({
			name: 'invoice',
			language: { code: 'en' },
			components: [
				{ type: 'header', parameters: [{ type: 'document', document: { link: 'https://x.test/a.pdf', filename: 'a.pdf' } }] },
				{ type: 'body', parameters: [{ type: 'text', text: 'Asha' }, { type: 'text', text: '42' }] },
				{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'order/42' }] },
			],
		});
	});

	it('builds text and media-id headers, and quick-reply buttons', () => {
		const t = buildTemplate('+1', { template: 'a::en', headerType: 'text', headerText: 'H', bodyValues: [], buttons: [{ index: 1, subType: 'quick_reply', value: 'P' }] });
		expect((t.template as { components: unknown[] }).components).toEqual([
			{ type: 'header', parameters: [{ type: 'text', text: 'H' }] },
			{ type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'P' }] },
		]);
		const v = buildTemplate('+1', { template: 'a::en', headerType: 'video', headerMediaSource: 'id', headerMedia: '123', bodyValues: [], buttons: [] });
		expect((v.template as { components: Array<{ parameters: unknown[] }> }).components[0].parameters[0]).toEqual({ type: 'video', video: { id: '123' } });
	});

	it('builds media by link or id, caption only where allowed', () => {
		expect(buildMedia('+1', 'image', 'link', 'https://x.test/i.png', { caption: 'c' }).image).toEqual({ link: 'https://x.test/i.png', caption: 'c' });
		expect(buildMedia('+1', 'audio', 'id', '99', { caption: 'ignored' }).audio).toEqual({ id: '99' });
		expect(buildMedia('+1', 'document', 'id', '9', { filename: 'f.pdf' }).document).toEqual({ id: '9', filename: 'f.pdf' });
	});

	it('builds interactive buttons and list', () => {
		const b = buildInteractiveButtons('+1', { body: 'Ok?', footer: 'f' }, [{ id: 'y', title: 'Yes' }]);
		expect(b.interactive).toEqual({
			type: 'button',
			body: { text: 'Ok?' },
			footer: { text: 'f' },
			action: { buttons: [{ type: 'reply', reply: { id: 'y', title: 'Yes' } }] },
		});
		const l = buildInteractiveList('+1', { body: 'Pick', header: 'H' }, 'Open', [
			{ title: 'S', rows: [{ id: 'r1', title: 'One', description: 'd' }, { id: 'r2', title: 'Two' }] },
		]);
		expect(l.interactive).toEqual({
			type: 'list',
			header: { type: 'text', text: 'H' },
			body: { text: 'Pick' },
			action: { button: 'Open', sections: [{ title: 'S', rows: [{ id: 'r1', title: 'One', description: 'd' }, { id: 'r2', title: 'Two' }] }] },
		});
	});
});
