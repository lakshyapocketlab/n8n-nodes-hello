import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://helloapi.lakshyapocketlab.com';

export type HelloContext =
	| IExecuteFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions;

export interface HelloPhoneNumber {
	phone_number_id: string;
	waba_id?: string;
	display_phone_number?: string;
	verified_name?: string;
	business_name?: string;
	can_send?: boolean;
	is_coexistence?: boolean;
}

interface HelloPaging {
	cursors?: { after?: string };
	next?: string;
}

/** Pulls Meta's `error.message` (and Hello's code) out of an API error body, when there is one. */
function describeError(error: JsonObject): JsonObject {
	const body = ((error.response as JsonObject | undefined)?.body ?? error.error) as
		| JsonObject
		| string
		| undefined;
	const envelope =
		body && typeof body === 'object' ? ((body.error as JsonObject | undefined) ?? body) : undefined;
	if (envelope && typeof envelope.message === 'string') {
		const data = envelope.error_data as JsonObject | undefined;
		const code = data?.hello_code ?? envelope.code;
		return { ...error, message: code ? `${envelope.message} (${String(code)})` : envelope.message };
	}
	return error;
}

export async function helloApiRequest(
	this: HelloContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject | object | undefined = undefined,
	qs: IDataObject = {},
	extra: Partial<IHttpRequestOptions> = {},
) {
	const credentials = await this.getCredentials('helloApi');
	const baseUrl = String(credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		qs,
		json: true,
		...extra,
	};
	if (body !== undefined) options.body = body as IDataObject;
	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'helloApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), describeError(error as JsonObject));
	}
}

/** Follows Meta-style cursor paging (`paging.cursors.after`) until `limit` items or the end. */
export async function helloApiRequestAllItems(
	this: HelloContext,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let after: string | undefined;
	do {
		const pageSize = limit ? Math.min(100, limit - results.length) : 100;
		const response = (await helloApiRequest.call(this, 'GET', endpoint, undefined, {
			...qs,
			limit: pageSize,
			...(after ? { after } : {}),
		})) as { data?: IDataObject[]; paging?: HelloPaging };
		results.push(...(response.data ?? []));
		after = response.paging?.next ? response.paging.cursors?.after : undefined;
	} while (after && (!limit || results.length < limit));
	return limit ? results.slice(0, limit) : results;
}

export async function getPhoneNumbers(this: HelloContext): Promise<HelloPhoneNumber[]> {
	const response = (await helloApiRequest.call(this, 'GET', '/v1/phone_numbers')) as {
		data?: HelloPhoneNumber[];
	};
	return response.data ?? [];
}

/** Templates belong to the WABA, so a phone number id is resolved to its waba_id first. */
export async function getWabaId(this: HelloContext, phoneNumberId: string): Promise<string> {
	const numbers = await getPhoneNumbers.call(this);
	const match = numbers.find((n) => n.phone_number_id === phoneNumberId);
	if (!match?.waba_id) {
		throw new NodeOperationError(
			this.getNode(),
			`No WhatsApp Business Account found for phone number ID "${phoneNumberId}"`,
		);
	}
	return match.waba_id;
}

export function phoneNumberOptions(numbers: HelloPhoneNumber[]): INodePropertyOptions[] {
	return numbers.map((n) => ({
		name: [n.display_phone_number, n.verified_name ?? n.business_name].filter(Boolean).join(' - ') || n.phone_number_id,
		value: n.phone_number_id,
		description: `Phone number ID ${n.phone_number_id}${n.can_send === false ? ' (cannot send now)' : ''}`,
	}));
}

/** Template dropdown values are `name::language`; a bare name is accepted for expressions. */
export const TEMPLATE_SEPARATOR = '::';

/** Normalises a recipient to E.164 with a leading "+", as the Hello API requires. */
export function normalizeRecipient(this: IExecuteFunctions, raw: string, itemIndex: number): string {
	const cleaned = String(raw).replace(/[\s\-().]/g, '');
	if (!/^\+\d{6,15}$/.test(cleaned)) {
		throw new NodeOperationError(
			this.getNode(),
			`Invalid recipient "${raw}": use the international format with a leading "+", for example +16505551234`,
			{ itemIndex },
		);
	}
	return cleaned;
}
