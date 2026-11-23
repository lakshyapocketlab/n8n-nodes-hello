import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://helloapi.lakshyapocketlab.com';

export class HelloApi implements ICredentialType {
	name = 'helloApi';

	displayName = 'Hello API';

	icon = { light: 'file:../nodes/Hello/hello.svg', dark: 'file:../nodes/Hello/hello.dark.svg' } as const;

	documentationUrl = 'https://lakshyapocketlab.com/docs/getting-started/authentication/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Hello API key (starts with hello_live_). Create one in the Hello dashboard.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: DEFAULT_BASE_URL,
			required: true,
			description: 'Hello API origin. Change it only for a self-hosted or staging environment.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/phone_numbers',
			method: 'GET',
		},
	};
}
