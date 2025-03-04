function createTimestampTracker() {
    let timestamp = 0;

    return {
        reset: () => (timestamp = 0),
        update: () => (timestamp = Date.now()),
        get: (delta: boolean = false) => (delta ? Date.now() - timestamp : timestamp),
    };
}

export const timestampTracker = createTimestampTracker();
