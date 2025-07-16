import { getGlobalAgentEntity } from '$/services/agent-manager/agent-store';
import { Agent } from '$/types/index';
import { getAgentType } from './agent';

export function getAnalyticsInfo() {
    const agent = getGlobalAgentEntity();
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

    const agentAnalytics = agent?.presenter
        ? {
              agentType: getAgentType(agent.presenter),
              agentVoice: {
                  voiceId: agent.presenter.voice?.voice_id,
                  provider: agent.presenter.voice?.type,
              },
          }
        : {};
    return {
        $os: `${getUserOS()}`,
        isMobile: `${mobileOrDesktop() == 'Mobile'}`,
        browser: navigator.userAgent,
        origin: window.location.origin,
        ...agentAnalytics,
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
