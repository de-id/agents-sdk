import { Agent } from "..";

export interface AnalyticsOptions {
    mixPanelKey: string;
    agent: Agent;
    chatId?: string;
    isEnabled?: boolean;
    distinct_id?: string;
}

class AnalyticsProvider {
    private static instance: AnalyticsProvider;
    private mixPanelKey: string;
    private distinct_id?: string;
    private isEnabled: boolean = true;
    private chatId?: string;
    private agentId: string;
    private owner_id: string;

    private constructor(config: AnalyticsOptions) {
        this.mixPanelKey = config.mixPanelKey || 'testKey';
        this.distinct_id = config.distinct_id || this.getUUID();
        this.isEnabled = config.isEnabled || true;
        this.chatId = config.chatId;
        this.agentId = config.agent.id;
        this.owner_id = config.agent.owner_id ?? ''
    }

    static getInstance(config?: AnalyticsOptions) {
        if (!AnalyticsProvider.instance) {
            if(!config) {
                throw Error('Trying to use Analytics before initiaalize and without config')
            }
            AnalyticsProvider.instance = new AnalyticsProvider(config);
        }
        return AnalyticsProvider.instance;
    }

    setChatId(id: string) {
        this.chatId = id;
    }

    getRandom() {
        return Math.random().toString(16).slice(2);
    }

    getUUID() {
        const trackingId = localStorage.getItem('tracking_id') ?? this.getRandom();
        localStorage.setItem('tracking_id', trackingId);
        return trackingId;
    }

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
                            token: this.mixPanelKey,
                            time: Date.now(),
                            chatId: this.chatId,
                            agentId: this.agentId,
                            owner_id: this.owner_id,
                            distinct_id: this.distinct_id,
                            $insert_id: this.getRandom(),
                            protect_id: this.mixPanelKey,
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
    }
}

export default AnalyticsProvider;
