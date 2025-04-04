import { getAuthHeader } from '$/auth/get-auth-header';
import { WsError } from '$/errors';
import { ChatProgressCallback } from '$/types';
import { Auth } from '$/types/auth';
import { sleep } from '$/utils';

interface Options {
    auth: Auth;
    retries?: number;
    callbacks?: {
        onMessage?: (event: MessageEvent) => void;
        onOpen?: (event: Event) => void;
        onClose?: (event: CloseEvent) => void;
        onError?: (error: string, event: Event) => void;
    };
    host?: string;
}

export interface SocketManager {
    socket?: WebSocket;
    disconnect: () => void;
    subscribeToEvents: (data: any) => void;
}

function connect(options: Options): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
        const { callbacks, host, auth } = options;
        const { onMessage = null, onOpen = null, onClose = null, onError = null } = callbacks || {};
        const socket = new WebSocket(`${host}?authorization=${getAuthHeader(auth)}`);

        socket.onmessage = onMessage;
        socket.onclose = onClose;

        socket.onerror = e => {
            console.error(e);
            onError?.('Websocket failed to connect', e);
            reject(e);
        };

        socket.onopen = e => {
            onOpen?.(e);
            resolve(socket);
        };
    });
}

async function connectWithRetries(options: Options): Promise<WebSocket> {
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

export async function createSocketManager(
    auth: Auth,
    host: string,
    callbacks: {
        onMessage: ChatProgressCallback;
        onError?: (error: Error) => void;
    }
): Promise<SocketManager> {
    const messageCallbacks: ChatProgressCallback[] = callbacks?.onMessage ? [callbacks.onMessage] : [];
    const socket: WebSocket = await connectWithRetries({
        auth,
        host,
        callbacks: {
            onError: error => callbacks.onError?.(new WsError(error)),
            onMessage(event: MessageEvent) {
                const parsedData = JSON.parse(event.data);
                messageCallbacks.forEach(callback => callback(parsedData.event, parsedData));
            },
        },
    });

    return {
        socket,
        disconnect: () => socket.close(),
        subscribeToEvents: (callback: ChatProgressCallback) => messageCallbacks.push(callback),
    };
}
