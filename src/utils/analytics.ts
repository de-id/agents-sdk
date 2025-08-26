import { Agent } from '$/types/index';
import { getAgentType } from './agent';

export function getAnalyticsInfo(agent: Agent) {
    const mobileOrDesktop = () => {
        return /Mobi|Android/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop';
    };
    const getUserOS = () => {
        const platform = navigator.platform;

        if (platform.toLowerCase().includes('win')) {
            return 'Windows';
        } else if (platform.toLowerCase().includes('mac')) {
            return 'Mac OS X';
        } else if (platform.toLowerCase().includes('linux')) {
            return 'Linux';
        } else {
            return 'Unknown'; // Unable to determine the OS
        }
    };
    const presenter = agent.presenter;

    return {
        $os: `${getUserOS()}`,
        isMobile: `${mobileOrDesktop() == 'Mobile'}`,
        browser: navigator.userAgent,
        origin: window.location.origin,
        agentType: getAgentType(presenter),
        agentVoice: {
            voiceId: agent.presenter?.voice?.voice_id,
            provider: agent.presenter?.voice?.type,
        },
    };
}

export function getAgentInfo(agent: Agent) {
    const promptCustomization = agent.llm?.prompt_customization;

    return {
        agentType: getAgentType(agent.presenter),
        owner_id: agent.owner_id ?? '',
        promptVersion: agent.llm?.prompt_version,
        behavior: {
            role: promptCustomization?.role,
            personality: promptCustomization?.personality,
            instructions: agent.llm?.instructions,
        },
        temperature: agent.llm?.temperature,
        knowledgeSource: promptCustomization?.knowledge_source,
        starterQuestionsCount: agent.knowledge?.starter_message?.length,
        topicsToAvoid: promptCustomization?.topics_to_avoid,
        maxResponseLength: promptCustomization?.max_response_length,
        agentId: agent.id,
        access: agent.access,
        name: agent.preview_name,
        ...(agent.access === 'public' ? { from: 'agent-template' } : {}),
    };
}
export const sumFunc = (numbers: number[]) => numbers.reduce((total, aNumber) => total + aNumber, 0);
export const average = (numbers: number[]) => sumFunc(numbers) / numbers.length;

export function getStreamAnalyticsProps(data: any, agent: Agent, additionalProps: Record<string, any>) {
    const { event, ...baseProps } = data;

    const { template } = agent?.llm || {};
    const { language } = agent?.presenter?.voice || {};

    const props = {
        ...baseProps,
        llm: { ...baseProps.llm, template },
        script: { ...baseProps.script, provider: { ...baseProps?.script?.provider, language } },
        stitch: agent?.presenter.type === 'talk' ? agent?.presenter?.stitch : undefined,
        ...additionalProps,
    };

    return props;
}
