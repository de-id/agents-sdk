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

interface SocketManager {
    socket?: WebSocket;
    terminate: () => void;
    connect: () => Promise<WebSocket>;
    subscribeToEvents: (eventCallbacks: { [event: string]: (data: any) => void }) => void;
}

const socketHost = 'wss://notifications-dev.d-id.com';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function connect(options: Options): Promise<WebSocket> {
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

export async function connectToSocket(options: Options, socketManager: SocketManager): Promise<WebSocket> {
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

    socketManager.socket = socket;
    return socket
}

export function subscribeToEvents(socket: WebSocket, eventCallbacks: { [event: string]: (data: any) => void }) {
    const existingMessageHandler = socket.onmessage as (event: MessageEvent) => void;

    socket.onmessage = (event: MessageEvent) => {
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

export async function SocketManager(auth: Auth, host: string = socketHost): Promise<SocketManager> {
    let socket: WebSocket | null
    let socketManager: SocketManager = {
        terminate: () => socketManager.socket?.close(),
        connect: async () => {
            socket = await connectToSocket({
                auth,
                host,
                callbacks: { onMessage: message => console.log('message', message) },
            }, socketManager);

            socketManager.socket = socket!;  // Non-null assertion
            return socket;
        },
        subscribeToEvents: (eventCallbacks: { [event: string]: (data: any) => void }) => {
            if (socketManager.socket) {
                subscribeToEvents(socketManager.socket, eventCallbacks);
            } else {
                console.error('Socket is not connected. Call connect() first.');
            }
        },
    };

    return socketManager;
}

