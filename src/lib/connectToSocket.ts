import { Auth } from '$/types/auth';
import { getAuthHeader } from './auth/getAuthHeader';

interface Options {
    auth: Auth;
    retries?: number;
    callbacks: {
        onMessage: (event: MessageEvent) => void;
        onOpen?: (event: Event) => void;
        onClose?: (event: CloseEvent) => void;
        onError?: (event: Event) => void;
    };
    host?: string;
}

interface SocketManagerProvider {
    socket?: WebSocket;
    terminate: () => void;
    connect: () => Promise<WebSocket>;
    subscribeToEvents: (eventCallbacks: { [event: string]: (data: any) => void }) => void;
}

const socketHost = 'wss://notifications-dev.d-id.com';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function connect(options: Options) {
    return new Promise<WebSocket>((resolve, reject) => {
        const { callbacks, host, auth } = options;
        const { onMessage, onOpen, onClose = null, onError } = callbacks;

        const socket = new WebSocket(`${host}?authorization=${getAuthHeader(auth)}`);

        socket.onmessage = onMessage;
        socket.onclose = onClose;

        socket.onerror = e => {
            console.log(e);

            onError?.(e);
            reject(e);
        };

        socket.onopen = e => {
            onOpen?.(e);
            resolve(socket);
        };
    });
}

export async function connectToSocket(options: Options): Promise<WebSocket> {
    const { retries = 1 } = options;
    let socket: WebSocket | null = null;

    for (let attempt = 0; socket?.readyState !== WebSocket.OPEN; attempt++) {
        try {
            socket = await connect(options);
        } catch (e) {
            if (attempt === retries) {
                throw e;
            }

            await sleep(attempt * 500);
        }
    }

    return socket;
}

export function subscribeToEvents(socket: WebSocket, eventCallbacks: { [event: string]: (data: any) => void }) {
    const existingMessageHandler = socket.onmessage as (event: MessageEvent<any>) => void;

    socket.onmessage = (event: MessageEvent<any>) => {
        existingMessageHandler?.(event); // Invoke the existing onmessage handler, if any.

        // Check for chat event callbacks
        if (event.data) {
            try {
                const eventData = JSON.parse(event.data);
                const eventType = eventData.event;

                if (eventType && eventCallbacks && eventCallbacks[eventType]) {
                    eventCallbacks[eventType](eventData.data);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        }
    };
}

export async function SocketManagerProiver(auth: Auth, host: string = socketHost): Promise<SocketManagerProvider> {
    let socket: WebSocket;
    let callbacks;

    const terminate = () => socket?.close();
    const connect = () => {
        return connectToSocket({
            auth,
            host,
            callbacks: { onMessage: message => console.log('message', message) },
        });
    };

    const clojuredSubscribe = (eventCallbacks: { [event: string]: (data: any) => void }) => {
        subscribeToEvents(socket, eventCallbacks);
    };

    return {
        terminate,
        connect,
        subscribeToEvents: clojuredSubscribe
    };
}