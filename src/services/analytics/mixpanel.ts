import { getExternalId } from '$/auth/get-auth-header';
import { getRandom } from '$/utils';
import { getAgentType } from '$/utils/agent';
import { getGlobalAgentEntity } from '../agent-manager/agent-store';

export interface AnalyticsOptions {
    agentId: string;
    token: string;
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

    const getAnalyticsInfo = () => {
        const agent = getGlobalAgentEntity();
        const promptCustomization = agent?.llm?.prompt_customization;

        return {
            token: config.token || 'testKey',
            distinct_id: config.distinctId || getExternalId(),
            agentId: config.agentId,
            agentType: agent ? getAgentType(agent.presenter) : undefined,
            owner_id: agent?.owner_id ?? '',
            promptVersion: agent?.llm?.prompt_version,
            behavior: {
                role: promptCustomization?.role,
                personality: promptCustomization?.personality,
                instructions: agent?.llm?.instructions,
            },
            temperature: agent?.llm?.temperature,
            knowledgeSource: promptCustomization?.knowledge_source,
            starterQuestionsCount: agent?.knowledge?.starter_message?.length,
            topicsToAvoid: promptCustomization?.topics_to_avoid,
            maxResponseLength: promptCustomization?.max_response_length,
        };
    };

    return {
        ...getAnalyticsInfo(),
        additionalProperties: {},
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
                                ...getAnalyticsInfo(),
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
