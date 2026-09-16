// @ts-check
/**
 * Local TypeDoc plugin for https://sdk.d-id.com/.
 *
 * TypeDoc's default theme puts the same `<meta name="description">` on every page and emits no
 * social-card tags. This plugin replaces the description with the page's own summary and adds
 * OpenGraph and Twitter tags, annotates the `modules.html` index with each symbol's summary, writes
 * an `llms.txt` index of every page with its summary, points the sitemap at the site root instead
 * of `index.html`, and copies a `404.html` into the site for GitHub Pages.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DeclarationReflection, DocumentReflection, PageEvent, ProjectReflection, Renderer } from 'typedoc';

const SITE_NAME = 'D-ID Client SDK';
const SITE_DESCRIPTION =
    'API reference for @d-id/client-sdk, the browser SDK for D-ID Agents: connect to an agent, stream its video and audio, chat and speak.';
const MAX_DESCRIPTION = 160;

// index.html, modules.html and hierarchy.html all render the project reflection, so they would
// otherwise share one description. These say what each of the three pages actually is.
const PAGE_DESCRIPTIONS = {
    'modules.html': 'Every export of @d-id/client-sdk, grouped by category.',
    'hierarchy.html': 'The class hierarchy of @d-id/client-sdk, including every SDK error type.',
};

// The same three pages also share one `<title>`, which makes them indistinguishable in a tab strip
// or a history list. The landing page keeps the project title; these two say what they are.
const PAGE_TITLES = {
    'modules.html': `All exports | ${SITE_NAME}`,
    'hierarchy.html': `Class hierarchy | ${SITE_NAME}`,
};
const ASSETS_DIR = dirname(fileURLToPath(import.meta.url));

/** @param {import('typedoc').Application} app */
export function load(app) {
    app.renderer.on(PageEvent.END, page => {
        if (!page.contents) return;
        const base = String(app.options.getValue('hostedBaseUrl') || '');
        if (Object.hasOwn(PAGE_TITLES, page.url)) {
            page.contents = page.contents.replace(
                /<title>[^<]*<\/title>/,
                `<title>${escapeText(PAGE_TITLES[page.url])}</title>`
            );
        }
        const title = /<title>([^<]*)<\/title>/.exec(page.contents)?.[1] ?? SITE_NAME;
        const description = Object.hasOwn(PAGE_DESCRIPTIONS, page.url)
            ? PAGE_DESCRIPTIONS[page.url]
            : describe(page.model);
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

        if (page.url === 'modules.html' && page.model instanceof ProjectReflection) {
            page.contents = annotateIndex(page.contents, page.model);
        }
        if (page.url === 'index.html') {
            page.contents = dropDuplicateReadmeTitle(page.contents);
            if (base) page.contents = relativizeSelfLinks(page.contents, base);
        }
    });

    app.renderer.on(Renderer.EVENT_END, event => {
        copyFileSync(join(ASSETS_DIR, '404.html'), join(event.outputDirectory, '404.html'));
        writeFileSync(join(event.outputDirectory, 'llms.txt'), llmsTxt(app, event.project));
        rewriteSitemapRoot(app, event.outputDirectory);
    });
}

/**
 * The landing page renders the README, which needs its own `# D-ID Client SDK` heading to have a
 * title on npm and on GitHub. On the site that heading arrives directly under TypeDoc's own
 * `<h1>D-ID Client SDK - v3.0.0-0</h1>`, so the page opens with two H1s saying the same thing —
 * and the one that carries the version is the one a reader wants. Drop the README's copy here,
 * from the rendered page only; the file on npm is untouched.
 *
 * @param {string} html
 */
function dropDuplicateReadmeTitle(html) {
    return html.replace(
        /(<div class="tsd-panel tsd-typography">)<h1 [^>]*class="tsd-anchor-link"[^>]*>.*?<\/h1>\n?/s,
        '$1'
    );
}

/**
 * TypeDoc builds the sitemap from page urls, so the landing page is listed as `…/index.html` while
 * its own canonical link and every llms.txt row use `…/`. Point the sitemap at the root too, so a
 * crawler sees one URL for the page instead of two.
 *
 * @param {import('typedoc').Application} app
 * @param {string} outputDirectory
 */
function rewriteSitemapRoot(app, outputDirectory) {
    const base = String(app.options.getValue('hostedBaseUrl') || '');
    const sitemap = join(outputDirectory, 'sitemap.xml');
    if (!base || !existsSync(sitemap)) return;
    const contents = readFileSync(sitemap, 'utf8');
    writeFileSync(sitemap, contents.replace(`<loc>${base}index.html</loc>`, `<loc>${base}</loc>`));
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
        `- [Class hierarchy](${base}hierarchy.html): every SDK error type and where it sits under BaseError.`,
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

/**
 * The modules.html index lists bare names, which says nothing about what to open. Append each
 * name's summary after its link, matching the member-summary markup TypeDoc emits:
 * `<a href="…">Name</a>` immediately followed by the permalink anchor.
 *
 * Only real summaries are appended — `describe()`'s "X in the … API reference" fallback would
 * double each row's weight while saying nothing, so undocumented symbols keep their bare name.
 *
 * The map is keyed by name, not by reflection: a name that owns two pages (a `const` and the type
 * derived from it, say) is last-wins, so both of its rows show the same sentence.
 *
 * @param {string} contents
 * @param {ProjectReflection} project
 */
function annotateIndex(contents, project) {
    /** @type {Map<string, string>} */
    const summaries = new Map();
    for (const doc of project.documents ?? []) summaries.set(doc.name, describe(doc));
    for (const child of project.children ?? []) summaries.set(child.name, summaryOf(child));

    return contents.replace(
        /(<a href="[^"]+\.html">([^<]+)<\/a>)(<a href="#[^"]*" aria-label="Permalink")/g,
        (match, link, name, permalink) => {
            const summary = summaries.get(name);
            return summary ? `${link} — ${escapeText(summary)}${permalink}` : match;
        }
    );
}

/**
 * The reflection's own first sentence, or `''` when it carries no doc comment.
 * @param {import('typedoc').Reflection} model
 */
function summaryOf(model) {
    if (model instanceof ProjectReflection) return SITE_DESCRIPTION;
    if (model instanceof DocumentReflection) {
        const paragraph = partsToText(model.content)
            .split(/\n\s*\n/)
            .map(s => s.trim())
            .find(s => s && !s.startsWith('#'));
        return paragraph ? truncate(paragraph) : '';
    }
    const summary =
        firstParagraph(partsToText(model.comment?.summary)) ||
        firstParagraph(partsToText(/** @type {any} */ (model).signatures?.[0]?.comment?.summary));
    return summary ? truncate(summary) : '';
}

/**
 * Like {@link summaryOf}, but never empty: a meta description and an llms.txt row have to say
 * something, so an undocumented symbol falls back to its own name.
 * @param {import('typedoc').Reflection} model
 */
function describe(model) {
    const summary = summaryOf(model);
    if (summary) return summary;
    if (model instanceof DocumentReflection) return truncate(`${model.name} for @d-id/client-sdk.`);
    return truncate(`${model.name} in the ${SITE_NAME} API reference.`);
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
        .replace(/[`*]/g, '')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

/** @param {string} text */
function firstParagraph(text) {
    return text.split(/\n\s*\n/)[0]?.trim() ?? '';
}

/**
 * Keeps whole sentences: the longest run of sentences that fits, or the first sentence if even
 * that is too long, and only then a word-boundary cut.
 * @param {string} text
 */
function truncate(text) {
    const oneLine = text.replace(/\s*\n\s*/g, ' ').trim();
    if (oneLine.length <= MAX_DESCRIPTION) return oneLine;
    // A period ends a sentence only when whitespace follows, so URLs and version numbers stay intact.
    const sentences = oneLine.match(/(?:[^.!?]|[.!?](?!\s|$))+[.!?]+(?=\s|$)/g) ?? [];
    let kept = '';
    for (const sentence of sentences) {
        const next = `${kept}${sentence}`.trim();
        if (kept && next.length > MAX_DESCRIPTION) break;
        kept = next;
    }
    if (kept && kept.length <= MAX_DESCRIPTION) return kept;
    const cut = oneLine.slice(0, MAX_DESCRIPTION - 1);
    return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** @param {string} value */
function escapeText(value) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {string} value */
function escapeAttr(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The README keeps absolute `https://sdk.d-id.com/...` links so it works on npm and GitHub; on the
 * site itself they become relative, so a local preview stays on localhost and production navigates
 * in-site. Only links with a path are rewritten; a link to the site root is left alone.
 * @param {string} html
 * @param {string} base
 */
function relativizeSelfLinks(html, base) {
    const escaped = base.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return html.replace(new RegExp(`(href|src)="${escaped}([^"#?][^"]*)"`, 'g'), '$1="$2"');
}
