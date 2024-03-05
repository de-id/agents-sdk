export interface AnalyticsOptions {
    mixPanelKey: string;
    chatId?: string;
    agentId: string;
    isEnabled?: boolean;
    UUID?: string;
}

class AnalyticsProvider {
    private static instance: AnalyticsProvider;
    private mixPanelKey: string;
    private UUID?: string;
    private isEnabled: boolean = true;
    private chatId?: string;
    private agentId: string;

    private constructor(config: AnalyticsOptions) {
        this.mixPanelKey = config.mixPanelKey || 'testKey';
        this.UUID = config.UUID || 'testUUID';
        this.isEnabled = config.isEnabled || true;
        this.chatId = config.chatId;
        this.agentId = config.agentId;
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
        console.log('inside track');
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
                            distinct_id: this.UUID, // should be one, we set up when creating SDK
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
