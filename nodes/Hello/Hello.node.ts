import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getPhoneNumbers,
	getWabaId,
	helloApiRequest,
	helloApiRequestAllItems,
	normalizeRecipient,
	phoneNumberOptions,
	TEMPLATE_SEPARATOR,
} from './GenericFunctions';
import { helloProperties } from './HelloDescription';
import {
	buildInteractiveButtons,
	buildInteractiveList,
	buildMedia,
	buildTemplate,
	buildText,
	type TemplateInput,
} from './messageBuilders';

type Collection<T> = { [key: string]: T[] | undefined };

export class Hello implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hello',
		name: 'hello',
		icon: { light: 'file:hello.svg', dark: 'file:hello.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Send WhatsApp messages and manage templates with the Hello WhatsApp Business API',
		defaults: { name: 'Hello' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'helloApi', required: true }],
		properties: helloProperties,
	};

	methods = {
		loadOptions: {
			async getPhoneNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return phoneNumberOptions(await getPhoneNumbers.call(this));
			},

			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const phoneNumberId = this.getCurrentNodeParameter('phoneNumberId') as string;
				if (!phoneNumberId) return [];
				const wabaId = await getWabaId.call(this, phoneNumberId);
				const templates = await helloApiRequestAllItems.call(
					this,
					`/v1/${encodeURIComponent(wabaId)}/message_templates`,
					{ status: 'APPROVED' },
				);
				return templates.map((t) => ({
					name: `${String(t.name)} (${String(t.language)})`,
					value: `${String(t.name)}${TEMPLATE_SEPARATOR}${String(t.language)}`,
					description: `${String(t.category ?? '')} template`.trim(),
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const result = await runOperation.call(this, resource, operation, i);
				const list = Array.isArray(result) ? result : [result];
				for (const entry of list) {
					out.push({ json: entry as IDataObject, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}

async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (resource === 'phoneNumber') {
		const response = (await helloApiRequest.call(this, 'GET', '/v1/phone_numbers')) as {
			data?: IDataObject[];
		};
		return response.data ?? [];
	}

	if (resource === 'template') {
		const phoneNumberId = this.getNodeParameter('phoneNumberId', i) as string;
		const wabaId = await getWabaId.call(this, phoneNumberId);
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
		return await helloApiRequestAllItems.call(
			this,
			`/v1/${encodeURIComponent(wabaId)}/message_templates`,
			filters,
			limit,
		);
	}

	const phoneNumberId = this.getNodeParameter('phoneNumberId', i) as string;
	const phonePath = encodeURIComponent(phoneNumberId);

	if (resource === 'media') {
		const binaryName = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary = this.helpers.assertBinaryData(i, binaryName);
		const buffer = await this.helpers.getBinaryDataBuffer(i, binaryName);
		const mimeType =
			(this.getNodeParameter('mimeType', i, '') as string) || binary.mimeType || 'application/octet-stream';
		const form = new FormData();
		form.append('messaging_product', 'whatsapp');
		form.append('type', mimeType);
		form.append(
			'file',
			new Blob([new Uint8Array(buffer)], { type: mimeType }),
			binary.fileName ?? 'upload',
		);
		return (await helloApiRequest.call(this, 'POST', `/v1/${phonePath}/media`, form as unknown as IDataObject, {}, {
			json: false,
		}).then((r) => (typeof r === 'string' ? JSON.parse(r) : r))) as IDataObject;
	}

	// message operations
	const to = normalizeRecipient.call(this, this.getNodeParameter('to', i) as string, i);
	const options = this.getNodeParameter('options', i, {}) as { idempotencyKey?: string; replyTo?: string };
	const env = { replyTo: options.replyTo };
	let body: IDataObject;

	switch (operation) {
		case 'sendText':
			body = buildText(to, this.getNodeParameter('text', i) as string, this.getNodeParameter('previewUrl', i) as boolean, env);
			break;
		case 'sendTemplate': {
			const bodyParams = this.getNodeParameter('bodyParameters', i, {}) as Collection<{ value: string }>;
			const buttonParams = this.getNodeParameter('buttonParameters', i, {}) as Collection<{
				index: number;
				subType: 'url' | 'quick_reply';
				value: string;
			}>;
			const headerType = this.getNodeParameter('headerType', i) as TemplateInput['headerType'];
			const template = this.getNodeParameter('template', i) as string;
			if (!template) throw new NodeOperationError(this.getNode(), 'Select a template', { itemIndex: i });
			body = buildTemplate(
				to,
				{
					template,
					languageCode: this.getNodeParameter('languageCode', i, '') as string,
					headerType,
					headerText: headerType === 'text' ? (this.getNodeParameter('headerText', i) as string) : undefined,
					headerMediaSource:
						headerType !== 'none' && headerType !== 'text'
							? (this.getNodeParameter('headerMediaSource', i) as 'link' | 'id')
							: undefined,
					headerMedia:
						headerType !== 'none' && headerType !== 'text'
							? (this.getNodeParameter('headerMedia', i) as string)
							: undefined,
					headerFilename:
						headerType === 'document' ? (this.getNodeParameter('headerFilename', i, '') as string) : undefined,
					bodyValues: (bodyParams.parameters ?? []).map((p) => String(p.value)),
					buttons: (buttonParams.buttons ?? []).map((b) => ({ index: b.index, subType: b.subType, value: String(b.value) })),
				},
				env,
			);
			break;
		}
		case 'sendMedia':
			body = buildMedia(
				to,
				this.getNodeParameter('mediaType', i) as 'image',
				this.getNodeParameter('mediaSource', i) as 'link' | 'id',
				this.getNodeParameter('media', i) as string,
				{
					caption: this.getNodeParameter('caption', i, '') as string,
					filename: this.getNodeParameter('filename', i, '') as string,
				},
				env,
			);
			break;
		case 'sendInteractiveButtons': {
			const buttons = (this.getNodeParameter('buttons', i, {}) as Collection<{ id: string; title: string }>).items ?? [];
			if (buttons.length < 1 || buttons.length > 3) {
				throw new NodeOperationError(this.getNode(), 'Add between 1 and 3 buttons', { itemIndex: i });
			}
			body = buildInteractiveButtons(to, interactiveCommon.call(this, i), buttons, env);
			break;
		}
		case 'sendInteractiveList': {
			const sections = (
				this.getNodeParameter('sections', i, {}) as Collection<{
					title: string;
					rows: Collection<{ id: string; title: string; description?: string }>;
				}>
			).items ?? [];
			if (!sections.length) throw new NodeOperationError(this.getNode(), 'Add at least one section', { itemIndex: i });
			body = buildInteractiveList(
				to,
				interactiveCommon.call(this, i),
				this.getNodeParameter('listButton', i) as string,
				sections.map((s) => ({ title: s.title, rows: s.rows?.items ?? [] })),
				env,
			);
			break;
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, { itemIndex: i });
	}

	const headers: IDataObject = {};
	if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
	return (await helloApiRequest.call(this, 'POST', `/v1/${phonePath}/messages`, body, {}, { headers })) as IDataObject;
}

function interactiveCommon(this: IExecuteFunctions, i: number) {
	return {
		body: this.getNodeParameter('interactiveBody', i) as string,
		header: this.getNodeParameter('interactiveHeader', i, '') as string,
		footer: this.getNodeParameter('interactiveFooter', i, '') as string,
	};
}
