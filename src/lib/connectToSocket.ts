import { Auth } from '$/types/auth';
import { getAuthHeader } from './auth/getAuthHeader';

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
    connect: () => Promise<WebSocket>;
    subscribeToEvents: (data: any) => void
}

const socketHost = 'wss://notifications-dev.d-id.com';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomID = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let randomID = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        randomID += characters.charAt(randomIndex);
    }

    return randomID;
}

function connect(options: Options): Promise<WebSocket> {
    return new Promise<WebSocket>((resolve, reject) => {
        const { callbacks, host, auth } = options;
        const { onMessage = null, onOpen = null, onClose = null, onError = null } = callbacks || {};
        // TODO discuss with Sagi. If I create socket with randomID, haven't recieve messages
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

    return socket
}


export async function SocketManager(auth: Auth, host: string = socketHost): Promise<SocketManager> {
    let socket: WebSocket | null
    let messageCallbacks: ((data: any) => void)[] = [];
    let socketManager: SocketManager = {
        terminate: () => socketManager.socket?.close(),
        connect: async () => {
            socket = await connectToSocket({
                auth,
                host,
                callbacks: { onMessage: handleMessage },
            });

            socketManager.socket = socket;  

            return socket;
        },
        subscribeToEvents: (callback: (data: any) => void) => {
            if (socketManager.socket) {
                messageCallbacks.push(callback);
            } else {
                console.warn('Socket is not connected. Please call connect() first.');
            }
        },
    };

    function handleMessage(event: MessageEvent) {
        console.log('event', event)
        messageCallbacks.forEach(callback => callback(event));
    }

    return socketManager;
}

