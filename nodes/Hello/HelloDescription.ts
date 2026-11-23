import type { INodeProperties } from 'n8n-workflow';

const phoneNumber = (resources: string[], operations: string[]): INodeProperties => ({
	displayName: 'Phone Number Name or ID',
	name: 'phoneNumberId',
	type: 'options',
	typeOptions: { loadOptionsMethod: 'getPhoneNumbers' },
	required: true,
	default: '',
	description:
		'The WhatsApp number to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	displayOptions: { show: { resource: resources, operation: operations } },
});

const SEND_OPS = [
	'sendText',
	'sendTemplate',
	'sendMedia',
	'sendInteractiveButtons',
	'sendInteractiveList',
];

const to: INodeProperties = {
	displayName: 'To',
	name: 'to',
	type: 'string',
	required: true,
	default: '',
	placeholder: '+16505551234',
	description: 'Recipient in international format, with a leading "+"',
	displayOptions: { show: { resource: ['message'], operation: SEND_OPS } },
};

const sendOptions: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: { show: { resource: ['message'], operation: SEND_OPS } },
	options: [
		{
			displayName: 'Idempotency Key',
			name: 'idempotencyKey',
			type: 'string',
			default: '',
			description:
				'Sent as the Idempotency-Key header so a retried execution does not send the message twice',
		},
		{
			displayName: 'Reply to Message ID',
			name: 'replyTo',
			type: 'string',
			default: '',
			description: 'Message ID (wamid) to quote as a reply',
		},
	],
};

const mediaTypeOptions = [
	{ name: 'Audio', value: 'audio' },
	{ name: 'Document', value: 'document' },
	{ name: 'Image', value: 'image' },
	{ name: 'Sticker', value: 'sticker' },
	{ name: 'Video', value: 'video' },
];

export const helloProperties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Media', value: 'media' },
			{ name: 'Message', value: 'message' },
			{ name: 'Phone Number', value: 'phoneNumber' },
			{ name: 'Template', value: 'template' },
		],
		default: 'message',
	},

	// ---------------------------------------------------------------- message
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['message'] } },
		options: [
			{
				name: 'Send Interactive Buttons',
				value: 'sendInteractiveButtons',
				action: 'Send interactive reply buttons',
				description: 'Send a message with up to three quick-reply buttons (needs an open 24-hour window)',
			},
			{
				name: 'Send Interactive List',
				value: 'sendInteractiveList',
				action: 'Send an interactive list',
				description: 'Send a message with a list menu of up to ten rows (needs an open 24-hour window)',
			},
			{
				name: 'Send Media',
				value: 'sendMedia',
				action: 'Send an image video audio or document',
				description: 'Send an image, video, audio, document or sticker (needs an open 24-hour window)',
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				action: 'Send a template message',
				description: 'Send an approved template; the only message type that can start a conversation',
			},
			{
				name: 'Send Text',
				value: 'sendText',
				action: 'Send a text message',
				description: 'Send a text message (needs an open 24-hour window)',
			},
		],
		default: 'sendTemplate',
	},
	phoneNumber(['message'], SEND_OPS),
	to,

	// text
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		displayOptions: { show: { resource: ['message'], operation: ['sendText'] } },
	},
	{
		displayName: 'Preview URL',
		name: 'previewUrl',
		type: 'boolean',
		default: false,
		description: 'Whether to render a link preview for the first URL in the text',
		displayOptions: { show: { resource: ['message'], operation: ['sendText'] } },
	},

	// template
	{
		displayName: 'Template Name or ID',
		name: 'template',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplates', loadOptionsDependsOn: ['phoneNumberId'] },
		required: true,
		default: '',
		description: 'Approved template. The list shows "name (language)". Choose from the list, or specify a template name using an <a href="https://docs.n8n.io/code/expressions/">expression</a> together with the Language Code option. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
	},
	{
		displayName: 'Language Code',
		name: 'languageCode',
		type: 'string',
		default: '',
		placeholder: 'en_US',
		description:
			'Only needed when the template name is entered as an expression; a template picked from the list already carries its language',
		displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
	},
	{
		displayName: 'Header',
		name: 'headerType',
		type: 'options',
		default: 'none',
		options: [
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'None', value: 'none' },
			{ name: 'Text Variable', value: 'text' },
			{ name: 'Video', value: 'video' },
		],
		description: 'Header parameter for templates whose header has a variable or media',
		displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
	},
	{
		displayName: 'Header Text',
		name: 'headerText',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendTemplate'], headerType: ['text'] },
		},
	},
	{
		displayName: 'Header Media Source',
		name: 'headerMediaSource',
		type: 'options',
		default: 'link',
		options: [
			{ name: 'Link (URL)', value: 'link' },
			{ name: 'Media ID', value: 'id' },
		],
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendTemplate'],
				headerType: ['image', 'video', 'document'],
			},
		},
	},
	{
		displayName: 'Header Media',
		name: 'headerMedia',
		type: 'string',
		default: '',
		required: true,
		description: 'Public HTTPS URL of the file, or a media ID from the Upload operation',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendTemplate'],
				headerType: ['image', 'video', 'document'],
			},
		},
	},
	{
		displayName: 'Header Document File Name',
		name: 'headerFilename',
		type: 'string',
		default: '',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendTemplate'], headerType: ['document'] },
		},
	},
	{
		displayName: 'Body Parameters',
		name: 'bodyParameters',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Body Parameter',
		default: {},
		description: 'Values for {{1}}, {{2}}... in order.',
		displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
		options: [
			{
				name: 'parameters',
				displayName: 'Parameter',
				values: [{ displayName: 'Value', name: 'value', type: 'string', default: '' }],
			},
		],
	},
	{
		displayName: 'Button Parameters',
		name: 'buttonParameters',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Button Parameter',
		default: {},
		description: 'Dynamic values for buttons (URL suffix or quick-reply payload)',
		displayOptions: { show: { resource: ['message'], operation: ['sendTemplate'] } },
		options: [
			{
				name: 'buttons',
				displayName: 'Button',
				values: [
					{
						displayName: 'Button Index',
						name: 'index',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 9 },
						default: 0,
						description: 'Position of the button in the template, starting at 0',
					},
					{
						displayName: 'Button Type',
						name: 'subType',
						type: 'options',
						default: 'url',
						options: [
							{ name: 'Quick Reply', value: 'quick_reply' },
							{ name: 'URL', value: 'url' },
						],
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'URL suffix for URL buttons, payload for quick-reply buttons',
					},
				],
			},
		],
	},

	// media
	{
		displayName: 'Media Type',
		name: 'mediaType',
		type: 'options',
		options: mediaTypeOptions,
		default: 'image',
		displayOptions: { show: { resource: ['message'], operation: ['sendMedia'] } },
	},
	{
		displayName: 'Media Source',
		name: 'mediaSource',
		type: 'options',
		default: 'link',
		options: [
			{ name: 'Link (URL)', value: 'link' },
			{ name: 'Media ID', value: 'id' },
		],
		displayOptions: { show: { resource: ['message'], operation: ['sendMedia'] } },
	},
	{
		displayName: 'Media',
		name: 'media',
		type: 'string',
		required: true,
		default: '',
		description: 'Public HTTPS URL of the file, or a media ID from the Upload operation',
		displayOptions: { show: { resource: ['message'], operation: ['sendMedia'] } },
	},
	{
		displayName: 'Caption',
		name: 'caption',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendMedia'],
				mediaType: ['image', 'video', 'document'],
			},
		},
	},
	{
		displayName: 'File Name',
		name: 'filename',
		type: 'string',
		default: '',
		description: 'Name shown to the recipient',
		displayOptions: {
			show: { resource: ['message'], operation: ['sendMedia'], mediaType: ['document'] },
		},
	},

	// interactive (shared)
	{
		displayName: 'Body Text',
		name: 'interactiveBody',
		type: 'string',
		typeOptions: { rows: 3 },
		required: true,
		default: '',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendInteractiveButtons', 'sendInteractiveList'],
			},
		},
	},
	{
		displayName: 'Header Text',
		name: 'interactiveHeader',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendInteractiveButtons', 'sendInteractiveList'],
			},
		},
	},
	{
		displayName: 'Footer Text',
		name: 'interactiveFooter',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				resource: ['message'],
				operation: ['sendInteractiveButtons', 'sendInteractiveList'],
			},
		},
	},
	{
		displayName: 'Buttons',
		name: 'buttons',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, maxValue: 3 },
		placeholder: 'Add Button',
		default: { items: [{ id: 'yes', title: 'Yes' }] },
		displayOptions: { show: { resource: ['message'], operation: ['sendInteractiveButtons'] } },
		options: [
			{
				name: 'items',
				displayName: 'Button',
				values: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						description: 'Returned in the reply webhook when the button is tapped (max 256 characters)',
					},
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Button label (max 20 characters)',
					},
				],
			},
		],
	},
	{
		displayName: 'List Button Label',
		name: 'listButton',
		type: 'string',
		required: true,
		default: 'Choose',
		description: 'Label of the button that opens the list (max 20 characters)',
		displayOptions: { show: { resource: ['message'], operation: ['sendInteractiveList'] } },
	},
	{
		displayName: 'Sections',
		name: 'sections',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Section',
		default: {},
		displayOptions: { show: { resource: ['message'], operation: ['sendInteractiveList'] } },
		options: [
			{
				name: 'items',
				displayName: 'Section',
				values: [
					{
						displayName: 'Title',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Section title (max 24 characters)',
					},
					{
						displayName: 'Rows',
						name: 'rows',
						type: 'fixedCollection',
						typeOptions: { multipleValues: true },
						placeholder: 'Add Row',
						default: {},
						options: [
							{
								name: 'items',
								displayName: 'Row',
								values: [
									{ displayName: 'ID', name: 'id', type: 'string', default: '' },
									{
										displayName: 'Title',
										name: 'title',
										type: 'string',
										default: '',
										description: 'Max 24 characters',
									},
									{
										displayName: 'Description',
										name: 'description',
										type: 'string',
										default: '',
										description: 'Max 72 characters',
									},
								],
							},
						],
					},
				],
			},
		],
	},
	sendOptions,

	// ------------------------------------------------------------------ media
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['media'] } },
		options: [
			{
				name: 'Upload',
				value: 'upload',
				action: 'Upload a media file',
				description: 'Upload a file and get a media ID to use when sending from the same number',
			},
		],
		default: 'upload',
	},
	phoneNumber(['media'], ['upload']),
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		description: 'Name of the binary property that holds the file to upload',
		displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
	},
	{
		displayName: 'MIME Type',
		name: 'mimeType',
		type: 'string',
		default: '',
		placeholder: 'image/jpeg',
		description: 'Leave empty to use the MIME type of the binary data',
		displayOptions: { show: { resource: ['media'], operation: ['upload'] } },
	},

	// ------------------------------------------------------------ phoneNumber
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['phoneNumber'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many phone numbers',
				description: 'List the WhatsApp numbers of your organization',
			},
		],
		default: 'getAll',
	},

	// --------------------------------------------------------------- template
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['template'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many templates',
				description: 'List message templates, newest first',
			},
		],
		default: 'getAll',
	},
	phoneNumber(['template'], ['getAll']),
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource: ['template'], operation: ['getAll'], returnAll: [false] },
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Category',
				name: 'category',
				type: 'options',
				default: 'UTILITY',
				options: [
					{ name: 'Authentication', value: 'AUTHENTICATION' },
					{ name: 'Marketing', value: 'MARKETING' },
					{ name: 'Utility', value: 'UTILITY' },
				],
			},
			{ displayName: 'Language', name: 'language', type: 'string', default: '', placeholder: 'en_US' },
			{
				displayName: 'Name Contains',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Case-insensitive part of the template name',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				default: 'APPROVED',
				options: [
					{ name: 'Approved', value: 'APPROVED' },
					{ name: 'Paused', value: 'PAUSED' },
					{ name: 'Pending', value: 'PENDING' },
					{ name: 'Rejected', value: 'REJECTED' },
				],
			},
		],
	},
];
