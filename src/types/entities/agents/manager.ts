import { Auth } from '../../auth';
import { StreamingState } from '../../stream';

enum ChatProgress {
    Embed,
    Query,
    Answer,
    Complete,
}

interface AgentsAPICallbacks {
    /**
     * This callback will be triggered each time when RTC connection will change state
     * @param state 
     */
    onConnectionStateChange?(state: RTCIceConnectionState): void;
    onVideoStateChange?(state: StreamingState): void;
    onSrcObjectReady?(srcObject: MediaStream): void;
    onChatEvents?(progress: ChatProgress): void;
}

export interface AgentsManagerOptions {
    callbacks?: AgentsAPICallbacks;
    baseURL?: string;
    debug?: boolean;
    auth: Auth;
}