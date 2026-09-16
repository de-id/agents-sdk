import { Agent, AvatarType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['avatar']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: Agent['avatar']): AgentType => presenter.type;

export const getPresenterType = (presenter: Agent['avatar']): PresenterType => {
    // A hand-built `Agent` can carry a value outside the enum at runtime; answer with the least
    // capable tier.
    if (presenter.type === AvatarType.Expressive) return 'v4';
    if (presenter.type === AvatarType.Clip) return 'v3-pro';

    return 'v2';
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === AvatarType.Expressive;
