import { Agent } from '@sdk/types';
import { getAgentInfo, getAnalyticsInfo, getErrorMessage, getStreamAnalyticsProps } from './analytics';

const buildRuntimeAgent = (overrides: Partial<Agent> = {}): Agent => ({
    id: 'agent-123',
    owner_id: 'owner-456',
    name: 'Test Agent',
    thumbnail: 'https://example.com/thumb.png',
    starter_message: ['Hello!', 'How can I help?', 'Ask me anything'],
    knowledge: { id: 'knowledge-123' },
    avatar: { type: 'talk', voice: { language: 'en-US' } },
    ...overrides,
});

// Temporarily shadow navigator getters (they live on the prototype in jsdom) and restore afterwards.
function withNavigator(props: { userAgent?: string; platform?: string }, fn: () => void) {
    const originals: Record<string, PropertyDescriptor | undefined> = {};
    for (const [key, value] of Object.entries(props)) {
        originals[key] = Object.getOwnPropertyDescriptor(window.navigator, key);
        Object.defineProperty(window.navigator, key, { value, configurable: true });
    }
    try {
        fn();
    } finally {
        for (const key of Object.keys(props)) {
            const original = originals[key];
            if (original) {
                Object.defineProperty(window.navigator, key, original);
            } else {
                delete (window.navigator as unknown as Record<string, unknown>)[key];
            }
        }
    }
}

describe('getErrorMessage', () => {
    it('returns the message of an Error', () => {
        expect(getErrorMessage(new Error('boom'))).toBe('boom');
    });

    it('stringifies non-Error values', () => {
        expect(getErrorMessage('plain string')).toBe('plain string');
        expect(getErrorMessage(42)).toBe('42');
    });

    it('returns empty string for null/undefined', () => {
        expect(getErrorMessage(null)).toBe('');
        expect(getErrorMessage(undefined)).toBe('');
    });

    it('truncates messages to 256 characters', () => {
        expect(getErrorMessage(new Error('x'.repeat(500)))).toHaveLength(256);
    });

    it('does not throw on values that cannot be stringified', () => {
        expect(getErrorMessage(Object.create(null))).toBe('Unknown error');
    });
});

describe('getAgentInfo', () => {
    it('emits exactly the trimmed identity fields with their RuntimeAgent values', () => {
        expect(getAgentInfo(buildRuntimeAgent())).toEqual({
            agentType: 'talk',
            presenterType: 'v2',
            owner_id: 'owner-456',
            starterQuestionsCount: 3,
            agentId: 'agent-123',
            agentName: 'Test Agent',
        });
    });

    it('maps every presenter type to its presenterType', () => {
        expect(getAgentInfo(buildRuntimeAgent({ avatar: { type: 'talk' } }))).toMatchObject({
            agentType: 'talk',
            presenterType: 'v2',
        });
        expect(getAgentInfo(buildRuntimeAgent({ avatar: { type: 'clip' } }))).toMatchObject({
            agentType: 'clip',
            presenterType: 'v3-pro',
        });
        expect(getAgentInfo(buildRuntimeAgent({ avatar: { type: 'expressive' } }))).toMatchObject({
            agentType: 'expressive',
            presenterType: 'v4',
        });
    });

    it('defaults owner_id to an empty string and tolerates a missing starter_message', () => {
        const info = getAgentInfo(buildRuntimeAgent({ owner_id: undefined, starter_message: undefined }));
        expect(info.owner_id).toBe('');
        expect(info.starterQuestionsCount).toBeUndefined();
    });

    it('does not emit fields dropped by the RuntimeAgent rewrite', () => {
        const info = getAgentInfo(buildRuntimeAgent()) as Record<string, unknown>;
        for (const key of ['llm', 'access', 'voice_id', 'presenter_id', 'source_url', 'is_greenscreen', 'agentVoice']) {
            expect(info).not.toHaveProperty(key);
        }
    });
});

describe('getAnalyticsInfo', () => {
    it('emits the trimmed analytics payload plus environment context and nothing else', () => {
        const info = getAnalyticsInfo(buildRuntimeAgent());

        expect(info.agentType).toBe('talk');
        expect(info.agentVoice).toEqual({ language: 'en-US' });
        expect(info.browser).toBe(navigator.userAgent);
        expect(info.origin).toBe(window.location.origin);
        expect(typeof info.$os).toBe('string');
        expect(typeof info.isMobile).toBe('string');

        expect(Object.keys(info).sort()).toEqual(
            ['$os', 'agentType', 'agentVoice', 'browser', 'isMobile', 'origin'].sort()
        );
    });

    it('reads the voice language from presenter.voice and tolerates a missing voice', () => {
        expect(getAnalyticsInfo(buildRuntimeAgent({ avatar: { type: 'talk' } })).agentVoice).toEqual({
            language: undefined,
        });
    });

    it('derives $os and isMobile from navigator', () => {
        withNavigator({ userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari', platform: 'MacIntel' }, () => {
            const info = getAnalyticsInfo(buildRuntimeAgent());
            expect(info.$os).toBe('Mac OS X');
            expect(info.isMobile).toBe('true');
            expect(info.browser).toBe('Mozilla/5.0 (iPhone) Mobile Safari');
        });

        withNavigator({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Desktop', platform: 'Win32' }, () => {
            const info = getAnalyticsInfo(buildRuntimeAgent());
            expect(info.$os).toBe('Windows');
            expect(info.isMobile).toBe('false');
        });
    });

    it('does not emit fields dropped by the RuntimeAgent rewrite', () => {
        const info = getAnalyticsInfo(buildRuntimeAgent()) as Record<string, unknown>;
        for (const key of ['llm', 'access', 'voice_id', 'presenter_id', 'source_url', 'is_greenscreen', 'owner_id']) {
            expect(info).not.toHaveProperty(key);
        }
    });
});

describe('getStreamAnalyticsProps', () => {
    it('strips event, injects the voice language into script.provider, and merges additionalProps', () => {
        const data = {
            event: 'stream/started',
            streamId: 's-1',
            script: { text: 'hi', provider: { type: 'microsoft' } },
        };
        const agent = buildRuntimeAgent({ avatar: { type: 'talk', voice: { language: 'fr-FR' } } });

        const props = getStreamAnalyticsProps(data, agent, { mode: 'DirectPlayback' });

        expect(props).toEqual({
            streamId: 's-1',
            script: { text: 'hi', provider: { type: 'microsoft', language: 'fr-FR' } },
            mode: 'DirectPlayback',
        });
        expect(props).not.toHaveProperty('event');
    });

    it('sets script.provider.language to undefined when the agent has no voice, without throwing', () => {
        const props = getStreamAnalyticsProps(
            { event: 'x', script: { text: 'hi' } },
            buildRuntimeAgent({ avatar: { type: 'talk' } }),
            {}
        );

        expect(props.script.text).toBe('hi');
        expect(props.script.provider).toHaveProperty('language', undefined);
    });

    it('creates script.provider even when data carries no script', () => {
        const props = getStreamAnalyticsProps({ event: 'x', foo: 'bar' }, buildRuntimeAgent(), {});

        expect(props.foo).toBe('bar');
        expect(props.script).toEqual({ provider: { language: 'en-US' } });
    });

    it('lets additionalProps override base props', () => {
        const props = getStreamAnalyticsProps({ event: 'x', mode: 'old' }, buildRuntimeAgent(), { mode: 'new' });
        expect(props.mode).toBe('new');
    });
});
