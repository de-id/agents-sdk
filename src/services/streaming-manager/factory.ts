import { Agent, CreateStreamOptions, CreateStreamV2Options, StreamingManagerOptions, TransportProvider } from '$/types';
import { StreamingManager } from './common';
import { createWebRTCStreamingManager } from './webrtc-manager';

export enum StreamApiVersion {
    V1 = 'v1',
    V2 = 'v2',
}

export type ExtendedStreamOptions =
    | ({ version: StreamApiVersion.V1 } & CreateStreamOptions)
    | ({ version: StreamApiVersion.V2 } & CreateStreamV2Options);

export async function createStreamingManager(
    agent: Agent,
    streamOptions: ExtendedStreamOptions,
    options: StreamingManagerOptions
): Promise<StreamingManager<CreateStreamOptions | CreateStreamV2Options>> {
    const agentId = agent.id;

    switch (streamOptions.version) {
        case StreamApiVersion.V1: {
            const { version, ...createStreamOptions } = streamOptions;
            return createWebRTCStreamingManager(agentId, createStreamOptions, options);
        }

        case StreamApiVersion.V2: {
            const { version, ...createStreamOptions } = streamOptions;

            switch (createStreamOptions.transport_provider) {
                case TransportProvider.Livekit:
                    const { createLiveKitStreamingManager } = await import('./livekit-manager');
                    return createLiveKitStreamingManager(agentId, createStreamOptions, options);
                default:
                    throw new Error(`Unsupported transport provider: ${createStreamOptions.transport_provider}`);
            }
        }

        default:
            throw new Error(`Invalid stream version: ${(streamOptions as any).version}`);
    }
}
