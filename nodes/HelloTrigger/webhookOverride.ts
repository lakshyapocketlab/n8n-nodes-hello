import type { IDataObject, IHookFunctions } from 'n8n-workflow';

import { helloApiRequest } from '../Hello/GenericFunctions';

/**
 * Everything the trigger asks of Hello's "direct webhook" API lives in this file: the three
 * calls below plus the URL and token helpers. Moving the trigger to Hello-side forwarding
 * later means rewriting `getSubscription`, `createSubscription` and `deleteSubscription` only.
 */

/** Meta's limit for the callback URL, enforced by the Hello API as well. */
export const MAX_URL_LENGTH = 200;

/** Name of the query parameter that carries the secret token on the webhook URL. */
export const TOKEN_PARAM = 'hello_token';

export interface Subscription {
	enabled: boolean;
	url?: string;
	status?: string;
	plan_allows?: boolean;
}

export interface SubscriptionInput {
	url: string;
	verifyToken: string;
}

const path = (phoneNumberId: string) => `/v1/${encodeURIComponent(phoneNumberId)}/webhook-override`;

/** GET: what the number's webhook currently points at (Hello's record, no Meta call). */
export async function getSubscription(
	this: IHookFunctions,
	phoneNumberId: string,
): Promise<Subscription> {
	return (await helloApiRequest.call(this, 'GET', path(phoneNumberId))) as Subscription;
}

/** PUT: point the number at `url`. Meta verifies it synchronously (hub.challenge). */
export async function createSubscription(
	this: IHookFunctions,
	phoneNumberId: string,
	input: SubscriptionInput,
): Promise<Subscription> {
	const body: IDataObject = {
		url: input.url,
		verify_token: input.verifyToken,
		acknowledge_no_tracking: true,
	};
	return (await helloApiRequest.call(this, 'PUT', path(phoneNumberId), body)) as Subscription;
}

/** DELETE: Meta sends this number's events to Hello again. */
export async function deleteSubscription(this: IHookFunctions, phoneNumberId: string): Promise<void> {
	await helloApiRequest.call(this, 'DELETE', path(phoneNumberId));
}

/** Appends the secret token to the node's webhook URL as a query parameter. */
export function withToken(nodeUrl: string, secret: string): string {
	return `${nodeUrl}${nodeUrl.includes('?') ? '&' : '?'}${TOKEN_PARAM}=${secret}`;
}

/** Constant-time string comparison (both sides are short ASCII tokens). */
export function safeEqual(a: unknown, b: unknown): boolean {
	if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || a.length === 0) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
