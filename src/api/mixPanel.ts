export interface MixPanelOptions {
    mixPanelKey: string;
    chatId?: string;
    agentId: string;
    isEnabled?: boolean;
    UUID?: string;
}

class AnalyticsProvider {
    private mixPanelKey: string;
    private UUID?: string;
    private isEnabled: boolean = true;
    private chatId?: string;
    private agentId: string;

    constructor(config: MixPanelOptions) {
        this.mixPanelKey = config.mixPanelKey || 'testKey';
        this.UUID = config.UUID || 'testUUID';
        this.isEnabled = config.isEnabled || true;
        this.chatId = config.chatId;
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
            return Promise.reject('MixPanel anlitics is disabled on created');
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
                            distinct_id: this.UUID, //should be one, we setup when create SDK
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
