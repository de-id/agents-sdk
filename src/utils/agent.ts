import { Agent } from '$/types';

type AgentType = 'clip_v2' | Agent['presenter']['type'];

export const getAgentType = (presenter: Agent['presenter']): AgentType =>
    presenter.type === 'clip' && presenter.presenter_id.startsWith('v2_') ? 'clip_v2' : presenter.type;
