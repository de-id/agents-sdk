import { Auth } from '%/auth';
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
