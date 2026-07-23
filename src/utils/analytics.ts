import { Agent } from '@sdk/types/index';
import { getAgentType, getPresenterType } from './agent';

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
    const presenter = agent.avatar;

    return {
        $os: `${getUserOS()}`,
        isMobile: `${mobileOrDesktop() == 'Mobile'}`,
        browser: navigator.userAgent,
        origin: window.location.origin,
        agentType: getAgentType(presenter),
        agentVoice: {
            language: agent.avatar?.voice?.language,
        },
    };
}

export function getAgentInfo(agent: Agent) {
    return {
        agentType: getAgentType(agent.avatar),
        presenterType: getPresenterType(agent.avatar),
        owner_id: agent.owner_id ?? '',
        starterQuestionsCount: agent.starter_message?.length,
        agentId: agent.id,
        agentName: agent.name,
    };
}
export const getErrorMessage = (error: unknown): string => {
    try {
        return String((error as Error)?.message ?? error ?? '').slice(0, 256);
    } catch {
        return 'Unknown error';
    }
};

export const sumFunc = (numbers: number[]) => numbers.reduce((total, aNumber) => total + aNumber, 0);
export const average = (numbers: number[]) => sumFunc(numbers) / numbers.length;
export const min = (numbers: number[]) => Math.min(...numbers);
export const max = (numbers: number[]) => Math.max(...numbers);
export const round = (value: number, decimals = 0) => {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
};
export const percentile = (numbers: number[], p: number) => {
    const sorted = [...numbers].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
};
export const median = (numbers: number[]) => percentile(numbers, 0.5);
/** Run fn, returning fallback instead of throwing — so a telemetry failure can never break the caller. */
export const safe = <T>(fn: () => T, fallback: T): T => {
    try {
        return fn();
    } catch {
        return fallback;
    }
};

export function getStreamAnalyticsProps(data: any, agent: Agent, additionalProps: Record<string, any>) {
    const { event, ...baseProps } = data;

    const { language } = agent?.avatar?.voice || {};

    const props = {
        ...baseProps,
        script: { ...baseProps.script, provider: { ...baseProps?.script?.provider, language } },
        ...additionalProps,
    };

    return props;
}
