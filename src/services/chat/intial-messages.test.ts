import { Message } from '@sdk/types';
import { getInitialMessages } from './intial-messages';

const message = (overrides: Partial<Message> & Pick<Message, 'content'>): Message => ({
    id: 'msg-1',
    role: 'assistant',
    parts: [],
    ...overrides,
});

describe('getInitialMessages', () => {
    it('should return an empty array when no messages were given', () => {
        expect(getInitialMessages()).toEqual([]);
        expect(getInitialMessages([])).toEqual([]);
    });

    it('should build the parts of a restored message from its content', () => {
        const stored = message({ content: 'Here it is: ![a cat](https://example.com/cat.png) — enjoy!' });

        expect(getInitialMessages([stored])).toEqual([
            {
                ...stored,
                parts: [
                    { type: 'text', text: 'Here it is: ' },
                    { type: 'image', src: 'https://example.com/cat.png', alt: 'a cat' },
                    { type: 'text', text: ' — enjoy!' },
                ],
            },
        ]);
    });

    it('should build the parts of a message whose parts field is missing altogether', () => {
        const stored = { id: 'msg-2', role: 'user', content: 'Hello' } as Message;

        expect(getInitialMessages([stored])[0].parts).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('should keep parts the caller built and not mutate the message it was given', () => {
        const parts: Message['parts'] = [{ type: 'text', text: 'my own parts' }];
        const stored = message({ content: '![a cat](https://example.com/cat.png)', parts });

        const [result] = getInitialMessages([stored]);

        expect(result).toBe(stored);
        expect(result.parts).toBe(parts);
    });

    it('should leave the caller array untouched while filling the copies it returns', () => {
        const stored = message({ content: 'Hello' });

        const [result] = getInitialMessages([stored]);

        expect(stored.parts).toEqual([]);
        expect(result).not.toBe(stored);
        expect(result.parts).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('should give an empty message an empty parts array', () => {
        expect(getInitialMessages([message({ content: '' })])[0].parts).toEqual([]);
    });
});
