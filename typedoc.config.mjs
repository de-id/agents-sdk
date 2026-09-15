// typedoc.config.mjs
// @ts-check
import { OptionDefaults } from 'typedoc';

/**
 * API reference for @d-id/client-sdk, published to https://sdk.d-id.com/.
 * Rationale for every option: docs/superpowers/specs/2026-09-14-sdk-reference-site-design.md §2.
 * @type {Partial<import('typedoc').TypeDocOptions>}
 */
const config = {
    // What to document
    entryPoints: ['src/index.ts'],
    tsconfig: 'tsconfig.json',
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    excludeExternals: true,

    // Output
    out: 'docs-site',
    // Keep page URLs as interfaces/AgentManager.html (not interfaces/index.AgentManager.html);
    // projectDocuments would otherwise make TypeDoc keep the single entry point as a module.
    alwaysCreateEntryPointModule: false,
    name: 'D-ID Client SDK',
    includeVersion: true,
    readme: 'README.md',
    projectDocuments: ['MIGRATION.md'],
    hostedBaseUrl: 'https://sdk.d-id.com/',
    useHostedBaseUrlForAbsoluteLinks: true,
    cname: 'sdk.d-id.com',
    githubPages: true,
    favicon: 'docs-assets/favicon.png',
    customCss: 'docs-assets/theme.css',
    titleLink: 'https://sdk.d-id.com/',
    navigationLinks: {
        'D-ID Docs': 'https://docs.d-id.com',
        'SDK Guide': 'https://docs.d-id.com/reference/agents-sdk-overview',
        npm: 'https://www.npmjs.com/package/@d-id/client-sdk',
        GitHub: 'https://github.com/de-id/agents-sdk',
    },
    hideGenerator: true,
    customFooterHtml: [
        `© ${new Date().getFullYear()} D-ID`,
        '<a href="https://docs.d-id.com">D-ID Docs</a>',
        '<a href="https://www.npmjs.com/package/@d-id/client-sdk">npm</a>',
        '<a href="https://github.com/de-id/agents-sdk/issues/new?labels=documentation">Report a documentation issue</a>',
    ].join(' · '),
    sourceLinkTemplate: 'https://github.com/de-id/agents-sdk/blob/{gitRevision}/{path}#L{line}',

    // Plugins
    plugin: ['typedoc-plugin-mdn-links', 'typedoc-plugin-coverage', './docs-assets/typedoc-seo.mjs'],

    // Organisation: sidebar grouped by @category, never by TS kind
    categorizeByGroup: false,
    defaultCategory: 'Other',
    categoryOrder: [
        'Agent Manager',
        'Authentication',
        'Callbacks & Events',
        'Streaming Options',
        'Speak & Scripts',
        'Chat',
        'Voice',
        'Errors',
        'Other',
    ],
    navigation: { includeCategories: true, includeGroups: false, includeFolders: false },
    sort: ['kind', 'alphabetical'],
    // Within a category: what you call first, the shapes it takes next, the vocabularies last.
    kindSortOrder: [
        'Reference',
        'Project',
        'Module',
        'Namespace',
        'Function',
        'Class',
        'Interface',
        'TypeAlias',
        'Enum',
        'Variable',
        'Constructor',
        'Property',
        'Accessor',
        'Method',
        'EnumMember',
        'Parameter',
        'TypeParameter',
        'TypeLiteral',
        'CallSignature',
        'ConstructorSignature',
        'IndexSignature',
        'GetSignature',
        'SetSignature',
        'Document',
    ],
    visibilityFilters: { inherited: true, external: false },
    searchInComments: true,
    searchInDocuments: true,

    // The source uses OpenAPI-style constraint tags; accept them instead of warning
    blockTags: [
        ...OptionDefaults.blockTags,
        '@minimum',
        '@maximum',
        '@min',
        '@max',
        '@minLength',
        '@maxLength',
        '@pattern',
    ],

    // PublicDataChannelTopic borrows one member of the internal DataChannelTopic enum on purpose

    // Validation. notDocumented is switched on by the doc-comments PR (Task 16).
    validation: { notExported: true, invalidLink: true, rewrittenLink: true, notDocumented: false },
    requiredToBeDocumented: [
        'Class',
        'Interface',
        'Enum',
        'EnumMember',
        'Function',
        'Method',
        'Property',
        'Accessor',
        'TypeAlias',
        'Variable',
        'Parameter',
    ],
    treatWarningsAsErrors: true,
};

export default config;
