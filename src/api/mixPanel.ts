class MixPanelManager {
    private mixPanelKey?: string; 
    private UUID?: string;

    constructor(mixPanelKey?: string, UUID?: string) {
        this.mixPanelKey = mixPanelKey || 'testKey';
        this.UUID = UUID || 'testUUID'
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
        console.log('inside track')
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
                            distinct_id: this.UUID,
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

export default MixPanelManager;
