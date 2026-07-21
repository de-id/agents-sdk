import { RuntimeAgent, VideoType } from '@sdk/types';

type AgentType = 'clip_v2' | RuntimeAgent['presenter']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: RuntimeAgent['presenter']): AgentType => presenter.type;

export const getPresenterType = (presenter: RuntimeAgent['presenter']): PresenterType => {
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
