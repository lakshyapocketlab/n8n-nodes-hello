import { createHmac, randomBytes } from 'crypto';

import type {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getPhoneNumbers, phoneNumberOptions } from '../Hello/GenericFunctions';
import { type HelloEventKind, parseEvents } from './eventParser';
import {
	createSubscription,
	deleteSubscription,
	getSubscription,
	MAX_URL_LENGTH,
	safeEqual,
	TOKEN_PARAM,
	withToken,
} from './webhookOverride';

interface StaticData extends IDataObject {
	hookUrl?: string;
	secret?: string;
	phoneNumberId?: string;
}

/**
 * Meta's verification handshake runs while the trigger is still being activated, before n8n
 * has saved this node's static data, so the verify token cannot be random-and-stored. It is
 * derived from the API key and number instead: stable, never stored, not reversible.
 */
async function deriveVerifyToken(
	ctx: IHookFunctions | IWebhookFunctions,
	phoneNumberId: string,
): Promise<string> {
	const credentials = await ctx.getCredentials('helloApi');
	return createHmac('sha256', String(credentials.apiKey))
		.update(`hello-n8n-verify:${phoneNumberId}`)
		.digest('hex')
		.slice(0, 40);
}

export class HelloTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Hello Trigger',
		name: 'helloTrigger',
		icon: { light: 'file:hello.svg', dark: 'file:hello.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description:
			'Starts a workflow when a WhatsApp number receives messages (direct webhook, bypasses the Hello inbox)',
		defaults: { name: 'Hello Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'helloApi', required: true }],
		webhooks: [
			{
				name: 'setup',
				httpMethod: 'GET',
				responseMode: 'onReceived',
				path: 'webhook',
			},
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'While this workflow is active, WhatsApp sends this number\'s events to n8n instead of Hello: the Hello inbox and delivery statistics stop for the number. Needs the "webhook_override" plan feature and a public HTTPS n8n URL. Deactivating the workflow gives the number back to Hello.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Phone Number Name or ID',
				name: 'phoneNumberId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getPhoneNumbers' },
				required: true,
				default: '',
				description:
					'The WhatsApp number to listen on. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: ['message'],
				options: [
					{
						name: 'Coexistence Echo',
						value: 'echo',
						description: 'Messages sent from the WhatsApp Business app on the same number',
					},
					{ name: 'Incoming Message', value: 'message', description: 'Messages from customers' },
					{
						name: 'Status Update',
						value: 'status',
						description: 'Sent, delivered, read and failed updates for your outgoing messages',
					},
				],
				description:
					'Which events start the workflow. Every event becomes one item with an "event" field. Echoes and status updates are off by default so auto-reply flows do not loop.',
			},
		],
	};

	methods = {
		loadOptions: {
			async getPhoneNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return phoneNumberOptions(await getPhoneNumbers.call(this));
			},
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				const phoneNumberId = this.getNodeParameter('phoneNumberId') as string;
				const current = await getSubscription.call(this, phoneNumberId);
				// Only the URL we registered (node URL + our stored secret) counts as ours.
				return Boolean(staticData.hookUrl) && current.enabled === true && current.url === staticData.hookUrl;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const phoneNumberId = this.getNodeParameter('phoneNumberId') as string;
				const nodeUrl = this.getNodeWebhookUrl('default') as string;
				const secret = randomBytes(16).toString('hex');
				const hookUrl = withToken(nodeUrl, secret);
				if (hookUrl.length > MAX_URL_LENGTH) {
					throw new NodeOperationError(
						this.getNode(),
						`The webhook URL is ${hookUrl.length} characters; Meta allows at most ${MAX_URL_LENGTH}. Use a shorter WEBHOOK_URL for your n8n instance.`,
					);
				}
				if (!hookUrl.startsWith('https://')) {
					throw new NodeOperationError(
						this.getNode(),
						'WhatsApp only delivers to public HTTPS URLs. Set WEBHOOK_URL on your n8n instance to a public https:// address (for example through a tunnel).',
					);
				}
				await createSubscription.call(this, phoneNumberId, {
					url: hookUrl,
					verifyToken: await deriveVerifyToken(this, phoneNumberId),
				});
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				staticData.hookUrl = hookUrl;
				staticData.secret = secret;
				staticData.phoneNumberId = phoneNumberId;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node') as StaticData;
				const phoneNumberId =
					staticData.phoneNumberId ?? (this.getNodeParameter('phoneNumberId') as string);
				if (staticData.hookUrl) {
					// Only release the number if it still points at this node; never clobber
					// a webhook someone else set in the meantime.
					const current = await getSubscription.call(this, phoneNumberId);
					if (current.enabled && current.url === staticData.hookUrl) {
						await deleteSubscription.call(this, phoneNumberId);
					}
				}
				delete staticData.hookUrl;
				delete staticData.secret;
				delete staticData.phoneNumberId;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const phoneNumberId = this.getNodeParameter('phoneNumberId') as string;

		// Meta's verification handshake (GET hub.challenge). Checked against the derived verify token.
		if (this.getWebhookName() === 'setup') {
			const query = this.getQueryData() as IDataObject;
			const expected = await deriveVerifyToken(this, phoneNumberId);
			if (query['hub.mode'] === 'subscribe' && safeEqual(query['hub.verify_token'], expected)) {
				res.status(200).send(String(query['hub.challenge'] ?? ''));
			} else {
				res.status(403).send('Forbidden');
			}
			return { noWebhookResponse: true };
		}

		// Deliveries are authenticated by the secret in the URL (Meta's signature uses Hello's app secret).
		const staticData = this.getWorkflowStaticData('node') as StaticData;
		const provided = (req.query as IDataObject)[TOKEN_PARAM];
		if (!safeEqual(provided, staticData.secret)) {
			res.status(401).send('Unauthorized');
			return { noWebhookResponse: true };
		}

		const kinds = this.getNodeParameter('events', ['message']) as HelloEventKind[];
		const items = parseEvents(this.getBodyData(), { kinds, phoneNumberId });
		if (!items.length) return { webhookResponse: 'ignored' };
		return { workflowData: [this.helpers.returnJsonArray(items)] };
	}
}
