// @ts-check
/**
 * Local TypeDoc plugin for https://sdk.d-id.com/.
 *
 * TypeDoc's default theme puts the same `<meta name="description">` on every page and emits no
 * social-card tags. This plugin replaces the description with the page's own summary and adds
 * OpenGraph and Twitter tags, writes an `llms.txt` index of every page with its summary, and copies
 * a `404.html` into the site for GitHub Pages.
 */
import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DeclarationReflection, DocumentReflection, PageEvent, ProjectReflection, Renderer } from 'typedoc';

const SITE_NAME = 'D-ID Client SDK';
const SITE_DESCRIPTION =
    'API reference for @d-id/client-sdk, the browser SDK for D-ID Agents: connect to an agent, stream its video and audio, chat and speak.';
const MAX_DESCRIPTION = 160;
const ASSETS_DIR = dirname(fileURLToPath(import.meta.url));

/** @param {import('typedoc').Application} app */
export function load(app) {
    app.renderer.on(PageEvent.END, page => {
        if (!page.contents) return;
        const base = String(app.options.getValue('hostedBaseUrl') || '');
        const title = /<title>([^<]*)<\/title>/.exec(page.contents)?.[1] ?? SITE_NAME;
        const description = describe(page.model);
        const url = base + (page.url === 'index.html' ? '' : page.url);
        const tags = [
            ['name', 'description', description],
            ['property', 'og:type', 'website'],
            ['property', 'og:site_name', SITE_NAME],
            ['property', 'og:title', title],
            ['property', 'og:description', description],
            ['property', 'og:url', url],
            ['property', 'og:image', `${base}assets/favicon.png`],
            ['name', 'twitter:card', 'summary'],
            ['name', 'twitter:title', title],
            ['name', 'twitter:description', description],
        ]
            .map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttr(value)}"/>`)
            .join('');
        const defaultTag = /<meta name="description" content="[^"]*"\/>/;
        page.contents = defaultTag.test(page.contents)
            ? page.contents.replace(defaultTag, tags)
            : page.contents.replace('</head>', `${tags}</head>`);
    });

    app.renderer.on(Renderer.EVENT_END, event => {
        copyFileSync(join(ASSETS_DIR, '404.html'), join(event.outputDirectory, '404.html'));
        writeFileSync(join(event.outputDirectory, 'llms.txt'), llmsTxt(app, event.project));
    });
}

/**
 * The llms.txt index (https://llmstxt.org/): one line per page with its summary, grouped the way
 * the sidebar is, so an assistant can pick the right page without crawling the site.
 *
 * @param {import('typedoc').Application} app
 * @param {ProjectReflection} project
 */
function llmsTxt(app, project) {
    const base = String(app.options.getValue('hostedBaseUrl') || '');
    /** @param {import('typedoc').Reflection} reflection */
    const urlOf = reflection => base + app.renderer.router.getFullUrl(reflection);
    const lines = [
        `# ${SITE_NAME}`,
        '',
        `> ${SITE_DESCRIPTION}`,
        '',
        'Install with `npm install @d-id/client-sdk`. Everything starts with `createAgentManager()`, which returns an `AgentManager` for one agent: `connect()`, then `chat()` or `speak()`.',
        '',
        '## Guides',
        `- [Overview](${base}): install the SDK, connect to an agent and send the first message.`,
    ];
    for (const doc of project.documents ?? []) {
        lines.push(`- [${doc.name}](${urlOf(doc)}): ${describe(doc)}`);
    }
    const categories = project.categories ?? [{ title: 'API', children: project.children ?? [] }];
    for (const category of categories) {
        const declarations = category.children.filter(child => child instanceof DeclarationReflection);
        if (declarations.length === 0) continue;
        lines.push('', `## ${category.title}`);
        for (const declaration of declarations) {
            lines.push(`- [${declaration.name}](${urlOf(declaration)}): ${describe(declaration)}`);
        }
    }
    return `${lines.join('\n')}\n`;
}

/** @param {import('typedoc').Reflection} model */
function describe(model) {
    if (model instanceof ProjectReflection) return SITE_DESCRIPTION;
    if (model instanceof DocumentReflection) {
        const paragraph = partsToText(model.content)
            .split(/\n{2,}/)
            .map(s => s.trim())
            .find(s => s && !s.startsWith('#'));
        return truncate(paragraph || `${model.name} for @d-id/client-sdk.`);
    }
    const summary =
        partsToText(model.comment?.summary) ||
        partsToText(/** @type {any} */ (model).signatures?.[0]?.comment?.summary);
    return truncate(summary || `${model.name} in the ${SITE_NAME} API reference.`);
}

/** @param {readonly import('typedoc').CommentDisplayPart[] | undefined} parts */
function partsToText(parts) {
    if (!parts) return '';
    return parts
        .map(part => {
            if (part.kind !== 'inline-tag') return part.text;
            const label = part.text.split('|').pop() ?? '';
            return label.trim();
        })
        .join('')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[`*_]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

/** @param {string} text */
function truncate(text) {
    const oneLine = text.replace(/\s*\n\s*/g, ' ');
    if (oneLine.length <= MAX_DESCRIPTION) return oneLine;
    const cut = oneLine.slice(0, MAX_DESCRIPTION - 1);
    return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** @param {string} value */
function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
