import type { IDataObject } from 'n8n-workflow';

export type HelloEventKind = 'message' | 'status' | 'echo';

export interface ParseOptions {
	/** Which kinds to emit. */
	kinds: HelloEventKind[];
	/** Only events for this number; others (one WABA can hold several) are dropped. */
	phoneNumberId?: string;
}

interface MetaValue {
	metadata?: { phone_number_id?: string; display_phone_number?: string };
	contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
	messages?: IDataObject[];
	statuses?: IDataObject[];
	message_echoes?: IDataObject[];
}

interface MetaPayload {
	entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: MetaValue }> }>;
}

/**
 * Flattens a Meta webhook delivery into one item per message, status or coexistence echo,
 * applying the kind and phone-number filters. Unknown fields are ignored.
 */
export function parseEvents(payload: unknown, opts: ParseOptions): IDataObject[] {
	const items: IDataObject[] = [];
	const entries = (payload as MetaPayload | undefined)?.entry;
	if (!Array.isArray(entries)) return items;

	for (const entry of entries) {
		for (const change of entry.changes ?? []) {
			const value = change.value;
			if (!value) continue;
			const phoneNumberId = value.metadata?.phone_number_id;
			if (opts.phoneNumberId && phoneNumberId && phoneNumberId !== opts.phoneNumberId) continue;

			const base: IDataObject = {
				phone_number_id: phoneNumberId ?? null,
				display_phone_number: value.metadata?.display_phone_number ?? null,
				waba_id: entry.id ?? null,
			};

			if (change.field === 'messages') {
				if (opts.kinds.includes('message')) {
					for (const message of value.messages ?? []) {
						const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
						items.push({
							event: 'message',
							...base,
							from: (message.from as string) ?? null,
							contact_name: contact?.profile?.name ?? null,
							type: (message.type as string) ?? null,
							message,
						});
					}
				}
				if (opts.kinds.includes('status')) {
					for (const status of value.statuses ?? []) {
						items.push({
							event: 'status',
							...base,
							recipient_id: (status.recipient_id as string) ?? null,
							status: (status.status as string) ?? null,
							message_id: (status.id as string) ?? null,
							statusDetails: status,
						});
					}
				}
			} else if (change.field === 'smb_message_echoes' && opts.kinds.includes('echo')) {
				for (const echo of value.message_echoes ?? []) {
					items.push({
						event: 'echo',
						...base,
						to: (echo.to as string) ?? null,
						type: (echo.type as string) ?? null,
						message: echo,
					});
				}
			}
		}
	}
	return items;
}
