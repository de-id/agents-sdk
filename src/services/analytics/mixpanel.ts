import { getExternalId } from '@sdk/auth/get-auth-header';
import { getRandom } from '@sdk/utils';

export interface AnalyticsOptions {
    token: string;
    agentId: string;
    isEnabled?: boolean;
    externalId?: string;
    mixpanelAdditionalProperties?: Record<string, any>;
}

export interface Analytics {
    token: string;
    distinct_id?: string;
    isEnabled: boolean;
    chatId?: string;
    agentId: string;
    owner_id?: string;
    getRandom(): string;
    track(event: string, props?: Record<string, any>): Promise<any>;
    linkTrack(mixpanelEvent: string, props: Record<string, any>, event: string, dependencies: string[]): any;
    enrich(props: Record<string, any>): void;
    additionalProperties: Record<string, any>;
}

interface MixpanelEvent {
    resolvedDependencies: string[];
    events: {
        [event: string]: { props: Record<string, any> };
    };
}

interface MixpanelEvents {
    [mixpanelEvent: string]: MixpanelEvent;
}

let mixpanelEvents: MixpanelEvents = {};
const mixpanelUrl = 'https://api-js.mixpanel.com/track/?verbose=1&ip=1';

export function initializeAnalytics(config: AnalyticsOptions): Analytics {
    const source = window?.hasOwnProperty('DID_AGENTS_API') ? 'agents-ui' : 'agents-sdk';

    return {
        token: config.token || 'testKey',
        distinct_id: getExternalId(config.externalId),
        agentId: config.agentId,
        additionalProperties: {
            id: getExternalId(config.externalId),
            ...(config.mixpanelAdditionalProperties || {}),
        },
        isEnabled: config.isEnabled ?? true,
        getRandom,
        enrich(props: Record<string, any>) {
            this.additionalProperties = { ...this.additionalProperties, ...props };
        },
        async track(event: string, props?: Record<string, any>) {
            if (!this.isEnabled) {
                return Promise.resolve();
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
                                ...this.additionalProperties,
                                ...sendProps,
                                agentId: this.agentId,
                                source,
                                token: this.token,
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

            try {
                return await fetch(mixpanelUrl, options).then(res => res.json());
            } catch (err) {
                return console.error(err);
            }
        },
        linkTrack(mixpanelEvent: string, props: Record<string, any>, event: string, dependencies: string[]) {
            if (!mixpanelEvents[mixpanelEvent]) {
                mixpanelEvents[mixpanelEvent] = { events: {}, resolvedDependencies: [] };
            }

            if (!dependencies.includes(event)) {
                dependencies.push(event);
            }

            const linkedEvent = mixpanelEvents[mixpanelEvent];

            linkedEvent.events[event] = { props };
            linkedEvent.resolvedDependencies.push(event);

            const allDependenciesResolved = dependencies.every(value =>
                linkedEvent.resolvedDependencies.includes(value)
            );

            if (allDependenciesResolved) {
                const aggregatedProps = dependencies.reduce((acc, curr) => {
                    if (linkedEvent.events[curr]) {
                        return { ...acc, ...linkedEvent.events[curr].props };
                    }
                    return acc;
                }, {});

                this.track(mixpanelEvent, aggregatedProps);

                linkedEvent.resolvedDependencies = linkedEvent.resolvedDependencies.filter(
                    event => !dependencies.includes(event)
                );
                dependencies.forEach(event => {
                    delete linkedEvent.events[event];
                });
            }
        },
    };
}
