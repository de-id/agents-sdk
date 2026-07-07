import { getExternalId } from '@sdk/auth/get-auth-header';
import { getRandom } from '@sdk/utils';
import { SDK_VERSION } from '@sdk/version';

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
    track(event: string, props?: Record<string, any>, eventTimestamp?: number): Promise<any>;
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

const mixpanelUrl = 'https://api-js.mixpanel.com/track/?verbose=1&ip=1';

// Re-send analytics that failed to POST (e.g. a network drop) once connectivity returns.
const MAX_QUEUE = 50;
const failedQueue: Array<Record<string, any>> = [];
let flushInFlight = false;

async function postEvents(events: Array<Record<string, any>>): Promise<void> {
    const response = await fetch(mixpanelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: JSON.stringify(events) }),
    });
    if (!response.ok) {
        throw new Error(`Mixpanel responded with ${response.status}`);
    }
}

function enqueueFailed(event: Record<string, any>): void {
    failedQueue.push(event);
    failedQueue.splice(MAX_QUEUE);
}

function flushQueue(): void {
    if (flushInFlight || !failedQueue.length) {
        return;
    }
    flushInFlight = true;
    const batch = failedQueue.splice(0, failedQueue.length);
    postEvents(batch)
        .catch(() => {
            failedQueue.unshift(...batch);
            failedQueue.splice(MAX_QUEUE);
        })
        .finally(() => {
            flushInFlight = false;
        });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('online', flushQueue);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                flushQueue();
            }
        });
    }
}

export function _resetOfflineBufferForTests(): void {
    failedQueue.length = 0;
    flushInFlight = false;
}

export function initializeAnalytics(config: AnalyticsOptions): Analytics {
    const source = window?.hasOwnProperty('DID_AGENTS_API') ? 'agents-ui' : 'agents-sdk';
    const mixpanelEvents: MixpanelEvents = {};

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
        async track(event: string, props?: Record<string, any>, eventTimestamp?: number) {
            if (!this.isEnabled) {
                return Promise.resolve();
            }

            // Ignore audioPath event from agent-video
            const { audioPath, ...sendProps } = props || {};

            const eventTime = eventTimestamp || Date.now();

            const eventData = {
                event,
                properties: {
                    ...this.additionalProperties,
                    ...sendProps,
                    agentId: this.agentId,
                    source,
                    emittedBy: 'agents-sdk',
                    sdkVersion: SDK_VERSION,
                    token: this.token,
                    time: eventTime,
                    $insert_id: this.getRandom(),
                    origin: window.location.href,
                    'Screen Height': window.screen.height || window.innerHeight,
                    'Screen Width': window.screen.width || window.innerWidth,
                    'User Agent': navigator.userAgent,
                },
            };

            flushQueue();
            postEvents([eventData]).catch(() => enqueueFailed(eventData));

            return Promise.resolve();
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
