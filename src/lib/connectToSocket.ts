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
    // subscribeToEvents: (eventCallbacks: { [event: string]: (data: any) => void }) => void;
    subscribeToEvents: (event: string, callback: (data: any) => void) => void;
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
        const socket = new WebSocket(`${host}?authorization=${getAuthHeader(auth)}.${getRandomID(8)}`);

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


export async function SocketManager(auth: Auth, host: string = socketHost): Promise<SocketManager> {
    let socket: WebSocket | null
    let socketManager: SocketManager = {
        terminate: () => socketManager.socket?.close(),
        connect: async () => {
            socket = await connectToSocket({
                auth,
                host,
                callbacks: { onMessage: message => console.log('message 111', message) },
            }, socketManager);

            socketManager.socket = socket;  
            console.log('socketManager.socket', socketManager.socket)
            return socket;
        },
        subscribeToEvents: (event: string, callback: (data: any) => void) => {
            if (socketManager.socket) {
                socketManager.socket.addEventListener(event, (e) => {
                    callback(e); // assuming you want to pass the data to the callback
                });
            } else {
                console.warn('Socket is not connected. Please call connect() first.');
            }
        },
    };

    return socketManager;
}

