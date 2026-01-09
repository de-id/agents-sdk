import {
    CreateSessionV2Options,
    CreateStreamOptions,
    StreamEvents,
    StreamInterruptPayload,
    StreamType,
} from '@sdk/types';
import { StreamingManager } from '../streaming-manager';
import { DataChannelTopic } from '../streaming-manager/livekit-manager';

export function validateInterrupt(
    streamingManager: StreamingManager<CreateStreamOptions> | undefined,
    streamType: StreamType | undefined,
    videoId: string | null
): void {
    if (!streamingManager) {
        throw new Error('Please connect to the agent first');
    }

    if (!streamingManager.interruptAvailable) {
        throw new Error('Interrupt is not enabled for this stream');
    }

    if (streamType !== StreamType.Fluent) {
        throw new Error('Interrupt only available for Fluent streams');
    }

    //TODO
    // if (!videoId) {
    //     throw new Error('No active video to interrupt');
    // }
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

export async function sendInterruptV2(streamingManager: StreamingManager<CreateSessionV2Options>): Promise<void> {
    const payload = {
        topic: DataChannelTopic.Interrupt,
    };
    streamingManager.sendDataChannelMessage(JSON.stringify(payload));
}
