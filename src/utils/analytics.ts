import {
    Agent,
} from '$/types/index';

export function getAnaliticsInfo(agent: Agent) {
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
    return {
        $os: `${getUserOS()}`,
        isMobile: `${mobileOrDesktop() == 'Mobile'}`,
        browser: navigator.userAgent,
        origin: window.location.origin,
        agentType: agent.presenter?.type,
        agentVoice: {
            voiceId: agent.presenter?.voice?.voice_id,
            provider: agent.presenter?.voice?.type,
        },
    };
}

export function getStreamAnalyticsProps(data: any, agent: any, additionalProps: Record<string, any>) {
    const { event, ...baseProps } = data;

    const { template } = agent?.llm || {};
    const { language } = agent?.presenter?.voice || {};
    const { stitch } = agent?.presenter || {};

    const props = {
        ...baseProps,
        llm: { ...baseProps.llm, template },
        script: { ...baseProps.script, provider: { ...baseProps?.script?.provider, language } },
        stitch,
        ...additionalProps
    };

    return props;
}
