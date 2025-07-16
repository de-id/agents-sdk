import { Agent } from '../../types';

let globalAgentEntity: Agent | null = null;

export function setGlobalAgentEntity(agent: Agent): void {
    globalAgentEntity = agent;
}

export function getGlobalAgentEntity(): Agent | null {
    return globalAgentEntity;
}

export function clearGlobalAgentEntity(): void {
    globalAgentEntity = null;
}
