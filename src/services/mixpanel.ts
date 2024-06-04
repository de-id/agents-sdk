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
        mainEvent: string,
        props: Record<string, any>,
        requiredSubEvents: string[],
        finalEventName?: string
    ): any
}

interface LinkedEvent {
    subEvents: string[];
    data: Record<string, any>;
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
        type: config.agent.presenter.type,
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
            mainEvent: string,
            props: Record<string, any>,
            requiredSubEvents: string[],
            finalEventName?: string
        ) {
            if (!linkedEvents[mainEvent]) {
                linkedEvents[mainEvent] = { subEvents: [], data: {} };
            }

            const { event: subEvent, ...data } = props;

            requiredSubEvents.push(subEvent);
            linkedEvents[mainEvent].subEvents.push(subEvent);

            if (data) {
                Object.assign(linkedEvents[mainEvent].data, data);
            }

            const savedSubEvents = linkedEvents[mainEvent].subEvents;
            const canTrackEvent = requiredSubEvents.every(value => savedSubEvents.includes(value));

            if (canTrackEvent) {
                this.track(mainEvent, { event: finalEventName || subEvent, ...linkedEvents[mainEvent].data });
                delete linkedEvents[mainEvent]
            }
        }
    }
};

