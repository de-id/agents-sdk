import { MessagePart } from '@sdk/types/entities/agents/chat';

// Video thumbnail syntax: [![alt](thumbnail-url)](video-url)
const VIDEO_THUMBNAIL_RE = /\[!\[([^\[\]]*)\]\(([^)\s]+)\)\]\(([^)\s]+)\)/g;

// Standard markdown image: ![alt](url)
const IMAGE_RE = /!\[([^\[\]]*)\]\(([^)\s]+)\)/g;

// Standard markdown link: [label](url) — but NOT images (no leading !)
const MD_LINK_RE = /(?<!!)\[([^\[\]]+)\]\(([^)\s]+)\)/g;

// HTML anchor: <a href="url">label</a>
const HTML_LINK_RE = /<a\s+href="([^"]*)"[^>]*?>([^<]*)<\/a>/gi;

interface MatchEntry {
    index: number;
    length: number;
    part: MessagePart;
}

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

    // 2. Markdown images: ![alt](url) — skip those already consumed by video thumbnails
    IMAGE_RE.lastIndex = 0;
    while ((m = IMAGE_RE.exec(content)) !== null) {
        const overlaps = matches.some(entry => m!.index >= entry.index && m!.index < entry.index + entry.length);
        if (!overlaps) {
            const src = m[2];
            const part: MessagePart = { type: 'image', src, alt: m[1] };
            if (src.toLowerCase().endsWith('.gif')) {
                (part as Extract<MessagePart, { type: 'image' }>).mimeType = 'image/gif';
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
