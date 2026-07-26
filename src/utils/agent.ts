import { Agent, VideoType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['avatar']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: Agent['avatar']): AgentType => presenter.type;

export const getPresenterType = (presenter: Agent['avatar']): PresenterType => {
    switch (presenter.type) {
        case 'expressive':
            return 'v4';
        case 'clip':
            return 'v3-pro';
        case 'talk':
            return 'v2';
    }
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === VideoType.Expressive;
