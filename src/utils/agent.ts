import { Agent, AvatarType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['avatar']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: Agent['avatar']): AgentType => presenter.type;

export const getPresenterType = (presenter: Agent['avatar']): PresenterType => {
    // `avatar.type` is declared as the enum's string values so callers can write `'talk'` without
    // importing `AvatarType`; the values are the enum's, so the switch reads them back as the enum
    // and stays exhaustive.
    switch (presenter.type as AvatarType) {
        case AvatarType.Expressive:
            return 'v4';
        case AvatarType.Clip:
            return 'v3-pro';
        case AvatarType.Talk:
            return 'v2';
    }
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === AvatarType.Expressive;
