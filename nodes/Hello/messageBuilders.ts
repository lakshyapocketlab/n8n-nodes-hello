import type { IDataObject } from 'n8n-workflow';

import { TEMPLATE_SEPARATOR } from './GenericFunctions';

/** Plain-data builders for the Cloud API message bodies the Hello API accepts. */

export interface MessageEnvelopeOptions {
	replyTo?: string;
}

function envelope(to: string, type: string, opts: MessageEnvelopeOptions): IDataObject {
	const body: IDataObject = {
		messaging_product: 'whatsapp',
		recipient_type: 'individual',
		to,
		type,
	};
	if (opts.replyTo) body.context = { message_id: opts.replyTo };
	return body;
}

export function buildText(
	to: string,
	text: string,
	previewUrl: boolean,
	opts: MessageEnvelopeOptions = {},
): IDataObject {
	return { ...envelope(to, 'text', opts), text: { body: text, preview_url: previewUrl } };
}

export interface TemplateInput {
	template: string;
	languageCode?: string;
	headerType: 'none' | 'text' | 'image' | 'video' | 'document';
	headerText?: string;
	headerMediaSource?: 'link' | 'id';
	headerMedia?: string;
	headerFilename?: string;
	bodyValues: string[];
	buttons: Array<{ index: number; subType: 'url' | 'quick_reply'; value: string }>;
}

export function parseTemplate(
	value: string,
	languageOverride?: string,
): { name: string; language: string } {
	const at = value.indexOf(TEMPLATE_SEPARATOR);
	if (at >= 0) {
		return { name: value.slice(0, at), language: languageOverride || value.slice(at + TEMPLATE_SEPARATOR.length) };
	}
	return { name: value, language: languageOverride ?? '' };
}

export function buildTemplate(
	to: string,
	input: TemplateInput,
	opts: MessageEnvelopeOptions = {},
): IDataObject {
	const { name, language } = parseTemplate(input.template, input.languageCode);
	const components: IDataObject[] = [];

	if (input.headerType === 'text') {
		components.push({
			type: 'header',
			parameters: [{ type: 'text', text: input.headerText ?? '' }],
		});
	} else if (input.headerType !== 'none') {
		const mediaRef: IDataObject = { [input.headerMediaSource === 'id' ? 'id' : 'link']: input.headerMedia };
		if (input.headerType === 'document' && input.headerFilename) mediaRef.filename = input.headerFilename;
		components.push({
			type: 'header',
			parameters: [{ type: input.headerType, [input.headerType]: mediaRef }],
		});
	}

	if (input.bodyValues.length) {
		components.push({
			type: 'body',
			parameters: input.bodyValues.map((text) => ({ type: 'text', text })),
		});
	}

	for (const button of input.buttons) {
		components.push({
			type: 'button',
			sub_type: button.subType,
			index: String(button.index),
			parameters: [
				button.subType === 'url'
					? { type: 'text', text: button.value }
					: { type: 'payload', payload: button.value },
			],
		});
	}

	const template: IDataObject = { name };
	if (language) template.language = { code: language };
	if (components.length) template.components = components;
	return { ...envelope(to, 'template', opts), template };
}

export function buildMedia(
	to: string,
	mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker',
	source: 'link' | 'id',
	media: string,
	extras: { caption?: string; filename?: string },
	opts: MessageEnvelopeOptions = {},
): IDataObject {
	const ref: IDataObject = { [source]: media };
	if (extras.caption && ['image', 'video', 'document'].includes(mediaType)) ref.caption = extras.caption;
	if (extras.filename && mediaType === 'document') ref.filename = extras.filename;
	return { ...envelope(to, mediaType, opts), [mediaType]: ref };
}

interface InteractiveCommon {
	body: string;
	header?: string;
	footer?: string;
}

function interactiveBase(common: InteractiveCommon, type: 'button' | 'list'): IDataObject {
	const interactive: IDataObject = { type, body: { text: common.body } };
	if (common.header) interactive.header = { type: 'text', text: common.header };
	if (common.footer) interactive.footer = { text: common.footer };
	return interactive;
}

export function buildInteractiveButtons(
	to: string,
	common: InteractiveCommon,
	buttons: Array<{ id: string; title: string }>,
	opts: MessageEnvelopeOptions = {},
): IDataObject {
	const interactive = interactiveBase(common, 'button');
	interactive.action = {
		buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
	};
	return { ...envelope(to, 'interactive', opts), interactive };
}

export function buildInteractiveList(
	to: string,
	common: InteractiveCommon,
	buttonLabel: string,
	sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>,
	opts: MessageEnvelopeOptions = {},
): IDataObject {
	const interactive = interactiveBase(common, 'list');
	interactive.action = {
		button: buttonLabel,
		sections: sections.map((s) => ({
			...(s.title ? { title: s.title } : {}),
			rows: s.rows.map((r) => ({
				id: r.id,
				title: r.title,
				...(r.description ? { description: r.description } : {}),
			})),
		})),
	};
	return { ...envelope(to, 'interactive', opts), interactive };
}
