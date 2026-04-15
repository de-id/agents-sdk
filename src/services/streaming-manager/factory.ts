import {
    Agent,
    CreateSessionV2Options,
    CreateSessionV2Response,
    CreateStreamOptions,
    StreamingManagerOptions,
    TransportProvider,
} from '@sdk/types';
import { StreamingManager } from './common';
import { createWebRTCStreamingManager } from './webrtc-manager';

export enum StreamApiVersion {
    V1 = 'v1',
    V2 = 'v2',
}

export type ExtendedStreamOptions =
    | ({ version: StreamApiVersion.V1 } & CreateStreamOptions)
    | ({ version: StreamApiVersion.V2 } & CreateSessionV2Options);

/**
 * Internal options that extend public StreamingManagerOptions with implementation details.
 */
export interface InternalStreamingManagerOptions extends StreamingManagerOptions {
    preCreatedSession?: CreateSessionV2Response;
}

export async function createStreamingManager(
    agent: Agent,
    streamOptions: ExtendedStreamOptions,
    options: InternalStreamingManagerOptions,
    signal?: AbortSignal
): Promise<StreamingManager<CreateStreamOptions | CreateSessionV2Options>> {
    const agentId = agent.id;

    switch (streamOptions.version) {
        case StreamApiVersion.V1: {
            const { version, ...createStreamOptions } = streamOptions;
            return createWebRTCStreamingManager(agentId, createStreamOptions, options, signal);
        }

        case StreamApiVersion.V2: {
            const { version, ...createStreamOptions } = streamOptions;

            switch (createStreamOptions.transport.provider) {
                case TransportProvider.Livekit:
                    const { createLiveKitStreamingManager } = await import('./livekit-manager');
                    return createLiveKitStreamingManager(agentId, createStreamOptions, options);
                default:
                    throw new Error(`Unsupported transport provider: ${createStreamOptions.transport.provider}`);
            }
        }

        default:
            throw new Error(`Invalid stream version: ${(streamOptions as any).version}`);
    }
}
