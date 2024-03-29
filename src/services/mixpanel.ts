import { getExternalId } from "$/auth/getAuthHeader";
import { Agent } from "..";

export interface AnalyticsOptions {
    mixPanelKey: string;
    agent: Agent;
    chatId?: string;
    isEnabled?: boolean;
    distinctId?: string;
}

export interface AnalyticsProvider {
    mixPanelKey: string;
    distinct_id?: string;
    isEnabled: boolean;
    chatId?: string;
    agentId: string;
    owner_id: string;
    getRandom(): string;
    track(event: string, props?: Record<string, any>): Promise<any>;
}

function initializeAnalyticsProvider(config: AnalyticsOptions): AnalyticsProvider {
    const instanceConfig =  {
        mixPanelKey: config.mixPanelKey || 'testKey',
        distinct_id: config.distinctId || getExternalId(),
        isEnabled: config.isEnabled ?? true,
        chatId: config.chatId,
        agentId: config.agent.id,
        owner_id: config.agent.owner_id ?? '',
    }

    const instance: AnalyticsProvider = {
        ...instanceConfig,

        getRandom() {
            return Math.random().toString(16).slice(2);
        },
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
                                time: Date.now(),
                                $insert_id: this.getRandom(),
                                origin: window.location.href,
                                'Screen Height': window.screen.height || window.innerWidth,
                                'Screen Width': window.screen.width || window.innerHeight,
                                'User Agent': navigator.userAgent,
                            },
                        },
                    ]),
                })
            };

            return fetch('https://api-js.mixpanel.com/track/?verbose=1&ip=1', options)
                .then(response => response.json())
                .catch(err => console.error(err));
        }
    };

    return instance;
}

export default initializeAnalyticsProvider;

