import { parseMessageParts, parseMessagePartsMemo } from './content-parser';

describe('parseMessageParts', () => {
    describe('plain text', () => {
        it('should return a single text part for plain text', () => {
            const result = parseMessageParts('Hello, world!');
            expect(result).toEqual([{ type: 'text', text: 'Hello, world!' }]);
        });

        it('should return empty array for empty string', () => {
            const result = parseMessageParts('');
            expect(result).toEqual([]);
        });

        it('should return a single text part for whitespace-only content', () => {
            const result = parseMessageParts('  \n  ');
            expect(result).toEqual([{ type: 'text', text: '  \n  ' }]);
        });
    });

    describe('markdown images', () => {
        it('should parse a markdown image', () => {
            const result = parseMessageParts('![alt text](https://example.com/image.png)');
            expect(result).toEqual([
                { type: 'image', src: 'https://example.com/image.png', alt: 'alt text' },
            ]);
        });

        it('should detect GIF images with mimeType', () => {
            const result = parseMessageParts('![animation](https://example.com/funny.gif)');
            expect(result).toEqual([
                { type: 'image', src: 'https://example.com/funny.gif', alt: 'animation', mimeType: 'image/gif' },
            ]);
        });

        it('should handle image with empty alt text', () => {
            const result = parseMessageParts('![](https://example.com/image.jpg)');
            expect(result).toEqual([
                { type: 'image', src: 'https://example.com/image.jpg', alt: '' },
            ]);
        });
    });

    describe('markdown video (thumbnail syntax)', () => {
        it('should parse video with thumbnail syntax [![alt](thumb)](video)', () => {
            const result = parseMessageParts('[![video title](https://example.com/thumb.jpg)](https://example.com/video.mp4)');
            expect(result).toEqual([
                { type: 'video', src: 'https://example.com/video.mp4', alt: 'video title', thumbnail: 'https://example.com/thumb.jpg' },
            ]);
        });
    });

    describe('markdown links', () => {
        it('should parse a markdown link', () => {
            const result = parseMessageParts('[click here](https://example.com)');
            expect(result).toEqual([
                { type: 'link', href: 'https://example.com', label: 'click here' },
            ]);
        });
    });

    describe('HTML links', () => {
        it('should parse an HTML anchor tag', () => {
            const result = parseMessageParts('<a href="https://example.com">Visit</a>');
            expect(result).toEqual([
                { type: 'link', href: 'https://example.com', label: 'Visit' },
            ]);
        });
    });

    describe('mixed content', () => {
        it('should parse text interleaved with an image', () => {
            const result = parseMessageParts('Hello ![pic](https://example.com/pic.png) world');
            expect(result).toEqual([
                { type: 'text', text: 'Hello ' },
                { type: 'image', src: 'https://example.com/pic.png', alt: 'pic' },
                { type: 'text', text: ' world' },
            ]);
        });

        it('should parse multiple different part types in order', () => {
            const content = 'Check this out: ![img](https://example.com/img.png)\nAnd visit [our site](https://example.com)';
            const result = parseMessageParts(content);
            expect(result).toEqual([
                { type: 'text', text: 'Check this out: ' },
                { type: 'image', src: 'https://example.com/img.png', alt: 'img' },
                { type: 'text', text: '\nAnd visit ' },
                { type: 'link', href: 'https://example.com', label: 'our site' },
            ]);
        });

        it('should handle content starting with an asset', () => {
            const result = parseMessageParts('![img](https://example.com/a.png) followed by text');
            expect(result).toEqual([
                { type: 'image', src: 'https://example.com/a.png', alt: 'img' },
                { type: 'text', text: ' followed by text' },
            ]);
        });

        it('should handle content ending with an asset', () => {
            const result = parseMessageParts('text then ![img](https://example.com/a.png)');
            expect(result).toEqual([
                { type: 'text', text: 'text then ' },
                { type: 'image', src: 'https://example.com/a.png', alt: 'img' },
            ]);
        });
    });

    describe('incomplete markdown (streaming partials)', () => {
        it('should keep incomplete image markdown as text', () => {
            const result = parseMessageParts('Hello ![loading](https://example.com/pic');
            expect(result).toEqual([{ type: 'text', text: 'Hello ![loading](https://example.com/pic' }]);
        });

        it('should keep incomplete link markdown as text', () => {
            const result = parseMessageParts('Check [this](https://exam');
            expect(result).toEqual([{ type: 'text', text: 'Check [this](https://exam' }]);
        });
    });
});

describe('parseMessagePartsMemo', () => {
    it('should return same reference for same input', () => {
        const content = 'Hello ![img](https://example.com/pic.png)';
        const result1 = parseMessagePartsMemo(content);
        const result2 = parseMessagePartsMemo(content);
        expect(result1).toBe(result2);
    });

    it('should return new result for different input', () => {
        const result1 = parseMessagePartsMemo('Hello');
        const result2 = parseMessagePartsMemo('World');
        expect(result1).not.toBe(result2);
    });
});
