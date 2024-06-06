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
        event: string,
        props: Record<string, any>,
        subEvent: string,
        requiredSubEvents: string[],
    ): any
}

interface SubEvent {
    props: Record<string, any>;
}

interface LinkedEvent {
    subEvents: { [subEvent: string]: SubEvent };
    completedSubEvents: string[];
}

interface LinkedEvents {
    [event: string]: LinkedEvent;
}

let linkedEvents: LinkedEvents = {};

export function initializeAnalytics(config: AnalyticsOptions): Analytics {
    const source = window?.hasOwnProperty('DID_AGENTS_API') ? 'agents-ui' : 'agents-sdk';
    const instanceConfig = {
        token: config.token || 'testKey',
        distinct_id: config.distinctId || getExternalId(),
        isEnabled: config.isEnabled ?? true,
        agentId: config.agent.id,
        agentType: config.agent.presenter.type,
        owner_id: config.agent.owner_id ?? '',
    };

    return {
        ...instanceConfig,
        getRandom: () => Math.random().toString(16).slice(2),
        track(event: string, props?: Record<string, any>) {
            if (!this.isEnabled) {
                return Promise.reject('MixPanel analytics is disabled on creation');
            }

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
                                ...props,
                                ...instanceConfig,
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
            event: string,
            props: Record<string, any>,
            subEvent: string,
            requiredSubEvents: string[],
        ) {
            if (!linkedEvents[event]) {
                linkedEvents[event] = { subEvents: {}, completedSubEvents: [] };
            }

            const linkedEvent = linkedEvents[event];

            linkedEvent.subEvents[subEvent] = { props };
            linkedEvent.completedSubEvents.push(subEvent);

            const allSubEventsCompleted = requiredSubEvents.every(value => linkedEvent.completedSubEvents.includes(value));

            if (allSubEventsCompleted) {
                const aggregatedProps = requiredSubEvents.reduce((acc, curr) => {
                    if (linkedEvent.subEvents[curr]) {
                        return { ...acc, ...linkedEvent.subEvents[curr].props };
                    }
                    return acc;
                }, {});

                this.track(event, aggregatedProps);

                // cleanup
                requiredSubEvents.forEach(subEvent => {
                    delete linkedEvent.subEvents[subEvent];
                });
                linkedEvent.completedSubEvents = linkedEvent.completedSubEvents.filter(subEvent => !requiredSubEvents.includes(subEvent));
            }
        }
    }
};

