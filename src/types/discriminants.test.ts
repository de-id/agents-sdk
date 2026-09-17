jest.mock('@sdk/config/environment', () => ({
    nodeEnv: 'test',
    didApiUrl: 'http://localhost',
    didSocketApiUrl: 'ws://localhost',
    mixpanelKey: '',
    agentId: '',
}));

import type {
    AgentAvatar,
    AgentManager,
    AmazonTtsProvider,
    AzureOpenAiTtsProvider,
    ElevenlabsTtsProvider,
    MicrosoftTtsProvider,
    TtsProvider,
} from '../index';
import { AvatarType, DataChannelTopic, Providers } from '../index';

/**
 * The enum-valued discriminants are declared as `` `${Enum}` ``, so a consumer can write the
 * string the reference shows without importing the enum, and code that already imports it keeps
 * compiling. These are compile-time assertions first: `yarn type-check` is what fails if a
 * discriminant goes back to being enum-only, and the runtime expectations below only pin the wire
 * values the two spellings share.
 */
describe('discriminants accept the enum member and its string', () => {
    it('accepts both spellings on every TTS provider', () => {
        const elevenlabs: ElevenlabsTtsProvider = { type: 'elevenlabs', voice_id: 'v1' };
        const elevenlabsEnum: ElevenlabsTtsProvider = { type: Providers.Elevenlabs, voice_id: 'v1' };
        const microsoft: MicrosoftTtsProvider = { type: 'microsoft', voice_id: 'en-US-JennyNeural' };
        const microsoftEnum: MicrosoftTtsProvider = { type: Providers.Microsoft, voice_id: 'en-US-JennyNeural' };
        const azure: AzureOpenAiTtsProvider = { type: 'azure-openai', voice_id: 'alloy' };
        const azureEnum: AzureOpenAiTtsProvider = { type: Providers.AzureOpenAi, voice_id: 'alloy' };
        const amazon: AmazonTtsProvider = { type: 'amazon', voice_id: 'Joanna' };
        const amazonEnum: AmazonTtsProvider = { type: Providers.Amazon, voice_id: 'Joanna' };

        expect([elevenlabs.type, microsoft.type, azure.type, amazon.type]).toEqual([
            elevenlabsEnum.type,
            microsoftEnum.type,
            azureEnum.type,
            amazonEnum.type,
        ]);
    });

    it('rejects a string that is not a provider', () => {
        // @ts-expect-error 'openai' is not one of the four providers.
        const wrong: AmazonTtsProvider = { type: 'openai', voice_id: 'Joanna' };

        expect(wrong.type).toBe('openai');
    });

    it('still discriminates TtsProvider on the plain string', () => {
        // `voice_config` only exists on three of the four variants, so this compiles only while
        // `type` narrows the union.
        const voiceConfigOf = (provider: TtsProvider) => {
            switch (provider.type) {
                case 'elevenlabs':
                    return provider.voice_config?.stability;
                case 'microsoft':
                case 'azure-openai':
                    return provider.voice_config?.style;
                case 'amazon':
                    return undefined;
            }
        };

        expect(voiceConfigOf({ type: 'elevenlabs', voice_id: 'v1', voice_config: { stability: 0.5 } })).toBe(0.5);
        expect(voiceConfigOf({ type: Providers.Microsoft, voice_id: 'v1', voice_config: { style: 'cheerful' } })).toBe(
            'cheerful'
        );
        expect(voiceConfigOf({ type: 'amazon', voice_id: 'Joanna' })).toBeUndefined();
    });

    it('accepts both spellings on AgentAvatar.type', () => {
        const fromStorage: AgentAvatar = { type: 'talk' };
        const fromEnum: AgentAvatar = { type: AvatarType.Talk };
        const expressive: AgentAvatar = { type: 'expressive', voice: { language: 'en-US' } };

        expect([fromStorage.type, expressive.type]).toEqual([fromEnum.type, AvatarType.Expressive]);
    });

    it('accepts both spellings as a sendDataChannelMessage topic', () => {
        type Topic = Parameters<AgentManager['sendDataChannelMessage']>[0];

        const topics: Topic[] = ['did.presentation', DataChannelTopic.Presentation];

        expect(topics[0]).toBe(topics[1]);
    });
});
