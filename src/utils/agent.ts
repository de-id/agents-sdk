import { Agent, VideoType } from '@sdk/types';

type AgentType = 'clip_v2' | Agent['presenter']['type'];

export type PresenterType = 'v4' | 'v3-pro' | 'v2';

export const getAgentType = (presenter: Agent['presenter']): AgentType =>
    presenter.type === 'clip' && presenter.presenter_id.startsWith('v2_') ? 'clip_v2' : presenter.type;

export const getPresenterType = (presenter: Agent['presenter']): PresenterType => {
    switch (presenter.type) {
        case 'expressive':
            return 'v4';
        case 'clip':
            return 'v3-pro';
        case 'talk':
            return 'v2';
    }
};

export const getPresenterIdentifier = (presenter: Agent['presenter']): string => {
    if (presenter.type === 'talk') {
        return presenter.source_url;
    }
    return presenter.presenter_id;
};

export const isStreamsV2Agent = (type: AgentType): boolean => type === VideoType.Expressive;
