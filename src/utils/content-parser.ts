import { MessagePart } from '@sdk/types/entities/agents/chat';

// Video thumbnail syntax: [![alt](thumbnail-url)](video-url)
const VIDEO_THUMBNAIL_RE = /\[!\[([^\[\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g;

// Standard markdown image: ![alt](url)
const IMAGE_RE = /!\[([^\[\]]*)\]\(([^)\s]+)\)/g;

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.ogv'];

function isVideoUrl(url: string): boolean {
    const path = url.split('?')[0].split('#')[0].toLowerCase();
    return VIDEO_EXTENSIONS.some(ext => path.endsWith(ext));
}

// Standard markdown link: [label](url) — but NOT images (no leading !)
const MD_LINK_RE = /(?<!!)\[([^\[\]]+)\]\(([^)\s]+)\)/g;

// HTML anchor: <a href="url">label</a>
const HTML_LINK_RE = /<a\s+href="([^"]*)"[^>]*?>([^<]*)<\/a>/gi;

interface MatchEntry {
    index: number;
    length: number;
    part: MessagePart;
}

/**
 * Splits a message's text into the typed {@link MessagePart | parts} a UI can render.
 *
 * The SDK already runs it over every message it builds and keeps the result on
 * {@link Message.parts}, so this is for content that comes from somewhere else — a transcript you
 * render outside the SDK, or text you assembled before handing it to a renderer.
 * {@link AgentManagerOptions.initialMessages | initialMessages} no longer need it: pass `parts: []`
 * and the SDK runs this for you. It recognizes markdown
 * images (`![alt](url)`), the video thumbnail form (`[![alt](thumb)](video)`), markdown links
 * (`[label](url)`) and HTML anchors (`<a href="url">label</a>`); an image whose URL looks like a
 * video becomes a `video` part instead, and a GIF is tagged with a `mimeType`, both under the rules
 * {@link MessagePart} sets out. Everything the parser does not recognize is preserved verbatim as a
 * `text` part, in its original order, and nothing is dropped or reordered; each recognized part
 * replaces the markup it was written as, so the parts are not a concatenation of the input.
 *
 * @param content - The message text to split, as it appears in {@link Message.content}.
 * @returns The parts in the order they appear in `content`: a single `text` part when there is no
 * markup to find, and an empty array for an empty string.
 * @example
 * ```ts
 * import { parseMessageParts } from '@d-id/client-sdk';
 *
 * parseMessageParts('Here it is: ![a cat](https://example.com/cat.png) — enjoy!');
 * // [
 * //     { type: 'text', text: 'Here it is: ' },
 * //     { type: 'image', src: 'https://example.com/cat.png', alt: 'a cat' },
 * //     { type: 'text', text: ' — enjoy!' },
 * // ]
 * ```
 * @category Chat
 */
export function parseMessageParts(content: string): MessagePart[] {
    if (content.length === 0) {
        return [];
    }

    const matches: MatchEntry[] = [];

    let m: RegExpExecArray | null;

    // 1. Video thumbnail: [![alt](thumb)](video) — must be matched first
    VIDEO_THUMBNAIL_RE.lastIndex = 0;
    while ((m = VIDEO_THUMBNAIL_RE.exec(content)) !== null) {
        matches.push({
            index: m.index,
            length: m[0].length,
            part: { type: 'video', src: m[3], alt: m[1], thumbnail: m[2] },
        });
    }

    // 2. Markdown images: ![alt](url) — skip those already consumed by video thumbnails.
    // A URL with a video extension is classified as video even without thumbnail syntax,
    // since backends frequently emit naked `![alt](video.mp4)` for video assets.
    IMAGE_RE.lastIndex = 0;
    while ((m = IMAGE_RE.exec(content)) !== null) {
        const overlaps = matches.some(entry => m!.index >= entry.index && m!.index < entry.index + entry.length);
        if (!overlaps) {
            const src = m[2];
            const alt = m[1];
            let part: MessagePart;
            if (isVideoUrl(src)) {
                part = { type: 'video', src, alt };
            } else {
                part = { type: 'image', src, alt };
                if (src.toLowerCase().endsWith('.gif')) {
                    (part as Extract<MessagePart, { type: 'image' }>).mimeType = 'image/gif';
                }
            }
            matches.push({ index: m.index, length: m[0].length, part });
        }
    }

    // 3. Markdown links: [label](url) — skip those already consumed
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(content)) !== null) {
        const overlaps = matches.some(entry => m!.index >= entry.index && m!.index < entry.index + entry.length);
        if (!overlaps) {
            matches.push({
                index: m.index,
                length: m[0].length,
                part: { type: 'link', href: m[2], label: m[1] },
            });
        }
    }

    // 4. HTML links: <a href="url">label</a> — skip those already consumed
    HTML_LINK_RE.lastIndex = 0;
    while ((m = HTML_LINK_RE.exec(content)) !== null) {
        const overlaps = matches.some(entry => m!.index >= entry.index && m!.index < entry.index + entry.length);
        if (!overlaps) {
            matches.push({
                index: m.index,
                length: m[0].length,
                part: { type: 'link', href: m[1], label: m[2] },
            });
        }
    }

    // No matches → single text part
    if (matches.length === 0) {
        return [{ type: 'text', text: content }];
    }

    // Sort by position
    matches.sort((a, b) => a.index - b.index);

    // Build parts array with text gaps
    const parts: MessagePart[] = [];
    let cursor = 0;

    for (const entry of matches) {
        if (entry.index > cursor) {
            parts.push({ type: 'text', text: content.slice(cursor, entry.index) });
        }
        parts.push(entry.part);
        cursor = entry.index + entry.length;
    }

    if (cursor < content.length) {
        parts.push({ type: 'text', text: content.slice(cursor) });
    }

    return parts;
}

// Single-entry memoization — optimal for streaming where the same content string
// is checked multiple times per render cycle
let memoKey: string = '';
let memoValue: MessagePart[] = [];

export function parseMessagePartsMemo(content: string): MessagePart[] {
    if (content === memoKey) {
        return memoValue;
    }
    memoKey = content;
    memoValue = parseMessageParts(content);
    return memoValue;
}
