import { getExternalId } from '$/auth/get-auth-header';
import { Agent } from '$/types';

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
    const presenter = config.agent.presenter;
    const promptCustomization = config.agent.llm?.prompt_customization;

    const analyticProps = {
        token: config.token || 'testKey',
        distinct_id: config.distinctId || getExternalId(),
        agentId: config.agent.id,
        agentType: presenter.type === 'clip' && presenter.presenter_id.startsWith('v2_') ? 'clip_v2' : presenter.type,
        owner_id: config.agent.owner_id ?? '',
        behavior: {
            role: promptCustomization?.role,
            personality: promptCustomization?.personality,
            instructions: config.agent.llm?.instructions,
        },
        temperature: config.agent.llm?.temperature,
        knowledgeSource: promptCustomization?.knowledge_source,
        starterQuestionsCount: config.agent.knowledge?.starter_message?.length,
        topicsToAvoid: promptCustomization?.topics_to_avoid,
        maxResponseLength: promptCustomization?.max_response_length,
    };

    return {
        ...analyticProps,
        additionalProperties: {},
        isEnabled: config.isEnabled ?? true,
        getRandom: () => Math.random().toString(16).slice(2),
        enrich(properties: Record<string, any>) {
            const props = {};

            if (properties && typeof properties !== 'object') {
                throw new Error('properties must be a flat json object');
            }

            for (let prop in properties) {
                if (typeof properties[prop] === 'string' || typeof properties[prop] === 'number') {
                    props[prop] = properties[prop];
                }
            }

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
