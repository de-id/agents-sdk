import { Auth } from '$/types/auth';
import { getAuthHeader } from './auth/getAuthHeader';
import { didSocketApiUrl } from './environment';

interface Options {
    auth: Auth;
    retries?: number;
    callbacks?: {
        onMessage?: (event: MessageEvent) => void;
        onOpen?: (event: Event) => void;
        onClose?: (event: CloseEvent) => void;
        onError?: (event: Event) => void;
    };
    host?: string;
}

interface SocketManager {
    socket?: WebSocket;
    terminate: () => void;
    subscribeToEvents: (data: any) => void;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomID = length => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomID = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomID += characters.charAt(randomIndex);
    }

    return randomID;
};

function connect(options: Options): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
        const { callbacks, host, auth } = options;
        const { onMessage = null, onOpen = null, onClose = null, onError = null } = callbacks || {};
        // TODO switch to socket connection with random ID when it will return messages
        // const socket = new WebSocket(`${host}?authorization=${getAuthHeader(auth)}.${getRandomID(8)}`);
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

export async function SocketManager(auth: Auth, host: string = didSocketApiUrl): Promise<SocketManager> {
    const messageCallbacks: ((data: any) => void)[] = [];
    const socket: WebSocket = await connectWithRetries({
        auth,
        host,
        callbacks: {
            onMessage: (event: MessageEvent) => {
                messageCallbacks.forEach(callback => callback(event));
            },
        },
    });

    return {
        socket,
        terminate: () => socket.close(),
        subscribeToEvents: <T>(callback: (data: T) => void) => messageCallbacks.push(callback),
    };
}
