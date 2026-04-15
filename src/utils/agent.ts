import { Agent, CreateSessionV2Options, TransportProvider, VideoType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['presenter']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

/**
 * Build the canonical `CreateSessionV2Options` payload used when creating a
 * V2/LiveKit session. Centralized so every call site (sequential and
 * parallel-init) stays in sync on transport + chat_persist defaults.
 *
 * @param chatPersist - Optional override for chat_persist. Defaults to true.
 * @returns The V2 session creation payload.
 */
export const buildCreateSessionV2Options = (chatPersist: boolean = true): CreateSessionV2Options => ({
    transport: { provider: TransportProvider.Livekit },
    chat_persist: chatPersist,
});

export const getAgentType = (presenter: Agent['presenter']): AgentType =>
    presenter.type === VideoType.Clip && presenter.presenter_id.startsWith('v2_') ? 'clip_v2' : presenter.type;

export const getPresenterType = (presenter: Agent['presenter']): PresenterType => {
    switch (presenter.type) {
        case VideoType.Expressive:
            return 'v4';
        case VideoType.Clip:
            return 'v3-pro';
        case VideoType.Talk:
            return 'v2';
    }
};

export const getPresenterIdentifier = (presenter: Agent['presenter']): string => {
    if (presenter.type === VideoType.Talk) {
        return presenter.source_url;
    }
    return presenter.presenter_id;
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === VideoType.Expressive;
