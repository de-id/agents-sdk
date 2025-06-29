import { Chat, CreateStreamOptions, StreamEvents, StreamInterruptPayload, StreamType } from '$/types';
import { StreamingManager } from '../streaming-manager';

export function validateInterrupt(
    streamingManager: StreamingManager<CreateStreamOptions> | undefined,
    chat: Chat | undefined,
    streamType: StreamType | undefined,
    hasChatPending: boolean,
    hasVideoId: boolean
): void {
    if (!streamingManager || !chat) {
        throw new Error('Please connect to the agent first');
    }

    if (streamType !== StreamType.Fluent) {
        throw new Error('Interrupt only available for Fluent streams');
    }

    if (!hasChatPending && !hasVideoId) {
        throw new Error('No active video to interrupt');
    }
}

export async function sendInterrupt(
    streamingManager: StreamingManager<CreateStreamOptions>,
    videoId: string
): Promise<void> {
    const payload: StreamInterruptPayload = {
        type: StreamEvents.StreamInterrupt,
        videoId,
        timestamp: Date.now(),
    };

    streamingManager.sendDataChannelMessage(JSON.stringify(payload));
}
