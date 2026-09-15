import { Agent, VideoType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['avatar']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: Agent['avatar']): AgentType => presenter.type;

export const getPresenterType = (presenter: Agent['avatar']): PresenterType => {
    switch (presenter.type) {
        case VideoType.Expressive:
            return 'v4';
        case VideoType.Clip:
            return 'v3-pro';
        case VideoType.Talk:
            return 'v2';
    }
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === VideoType.Expressive;
