import { getExternalId } from '$/auth/getAuthHeader';
import { Agent } from '..';

export interface AnalyticsOptions {
    token: string;
    agent: Agent;
    isEnabled?: boolean;
    distinctId?: string;
}

export interface Analytics {
    token: string;
    distinct_id?: string;
    isEnabled: boolean;
    chatId?: string;
    agentId: string;
    owner_id: string;
    getRandom(): string;
    track(event: string, props?: Record<string, any>): Promise<any>;
    linkTrack(
        mixpanelEvent: string,
        props: Record<string, any>,
        event: string,
        dependencies: string[],
    ): any
}

interface MixpanelEvent {
    resolvedDependencies: string[];
    events: {
        [event: string]: { props: Record<string, any> };
    }
}

interface MixpanelEvents {
    [mixpanelEvent: string]: MixpanelEvent;
}

let mixpanelEvents: MixpanelEvents = {};

export function initializeAnalytics(config: AnalyticsOptions): Analytics {
    const source = window?.hasOwnProperty('DID_AGENTS_API') ? 'agents-ui' : 'agents-sdk';
    const presenter = config.agent.presenter;

    const analyticProps = {
        token: config.token || 'testKey',
        distinct_id: config.distinctId || getExternalId(),
        agentId: config.agent.id,
        agentType: presenter.type === 'clip' && presenter.presenter_id.startsWith('v2_') ? 'clip_v2' : presenter.type,
        owner_id: config.agent.owner_id ?? '',
    };

    return {
        ...analyticProps,
        isEnabled: config.isEnabled ?? true,
        getRandom: () => Math.random().toString(16).slice(2),
        track(event: string, props?: Record<string, any>) {
            if (!this.isEnabled) {
                return Promise.reject('MixPanel analytics is disabled on creation');
            }
            // Ignore audioPath event from agent-video
            const { audioPath, ...sendProps } = props || {};

            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    data: JSON.stringify([
                        {
                            event,
                            properties: {
                                ...sendProps,
                                ...analyticProps,
                                source,
                                time: Date.now(),
                                $insert_id: this.getRandom(),
                                origin: window.location.href,
                                'Screen Height': window.screen.height || window.innerWidth,
                                'Screen Width': window.screen.width || window.innerHeight,
                                'User Agent': navigator.userAgent,
                            },
                        },
                    ]),
                }),
            };

            return fetch('https://api-js.mixpanel.com/track/?verbose=1&ip=1', options)
                .then(response => response.json())
                .catch(err => console.error(err));
        },
        linkTrack(
            mixpanelEvent: string,
            props: Record<string, any>,
            event: string,
            dependencies: string[],
        ) {
            if (!mixpanelEvents[mixpanelEvent]) {
                mixpanelEvents[mixpanelEvent] = { events: {}, resolvedDependencies: [] };
            }

            if (!dependencies.includes(event)) {
                dependencies.push(event);
            }

            const linkedEvent = mixpanelEvents[mixpanelEvent];

            linkedEvent.events[event] = { props };
            linkedEvent.resolvedDependencies.push(event);

            const allDependenciesResolved = dependencies.every(value => linkedEvent.resolvedDependencies.includes(value));

            if (allDependenciesResolved) {
                const aggregatedProps = dependencies.reduce((acc, curr) => {
                    if (linkedEvent.events[curr]) {
                        return { ...acc, ...linkedEvent.events[curr].props };
                    }
                    return acc;
                }, {});

                this.track(mixpanelEvent, aggregatedProps);

                linkedEvent.resolvedDependencies = linkedEvent.resolvedDependencies.filter(event => !dependencies.includes(event));
                dependencies.forEach(event => {
                    delete linkedEvent.events[event];
                });
            }
        }
    }
};

