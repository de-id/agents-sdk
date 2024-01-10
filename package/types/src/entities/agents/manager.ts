import { Auth } from '../../auth';
import { StreamingState } from '../../stream';

enum ChatProgress {
    Embed,
    Query,
    Answer,
    Complete,
}

interface ManagerCallbacks {
    onConnectionStateChange?(state: RTCIceConnectionState): void;
    onVideoStateChange?(state: StreamingState): void;
    onSrcObjectReady?(srcObject: MediaStream): void;
    onChatEvents?(progress: ChatProgress): void;
}

export interface AgentManagerOptions {
    callbacks: ManagerCallbacks;
    baseURL?: string;
    debug?: boolean;
    auth: Auth;
}
