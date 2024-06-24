import { StreamScript } from '../..';
import { CompatibilityMode } from '../stream';

export interface CreateTalkStreamRequest {
    source_url: string;
    driver_url?: string;
    face?: {
        size: number;
        top_left: [number, number];
        overlap?: 'NO' | 'YES' | 'PARTIAL' | 'UNKNOWN';
        face_id?: string;
        detect_confidence?: number;
        detection?: {
            top: number;
            left: number;
            right: number;
            bottom: number;
        };
    };
    config?: {
        motion_factor?: number;
        align_expand_factor?: number;
        stitch?: boolean;
    };
    /**
     * Supported only with Talk presenters (photo-based).
     * The output resolution sets the maximum height or width of the streamed video.
     * The aspect ratio is preserved from the source image.
     * When resolution is not configured, it defaults to the agent output resolution.
     * @minimum 150
     * @maximum 1080
     * @example 512
     */
    output_resolution?: number;
    /**
     * Defines the video codec to be used in the stream.
     * When set to on: VP8 will be used.
     * When set to off: H264 will be used
     * When set to auto the codec will be selected according to the browser.
     * @default auto
     */
    compatibility_mode?: CompatibilityMode;
    /**
     * Whether to stream wamrup video on the connection.
     * If set to true, will stream a warmup video when connection is established.
     * At the end of the warmup video, a message containing "stream/ready" will be sent on the data channel.
     */
    stream_warmup?: boolean;
    /**
     * Maximum duration (in seconds) between messages before session times out.
     * Can only be used with proper permissions
     * @maximum 300
     * @example 180
     */
    session_timeout?: number;
}

export interface SendTalkStreamPayload {
    script: StreamScript;
    resultUrl?: string;
    config?: {
        align_driver?: boolean;
        auto_match?: boolean;
        normalization_factor?: number;
        sharpen?: boolean;
        result_format?: 'mp4' | 'gif' | 'mov';
        fluent?: boolean;
        driver_expressions?: {
            expressions: {
                start_frame: number;
                expression: string;
                intensity: number;
            };
            transition_frames?: number;
        };
    };
    user_data?: Record<string, any>;
    name?: string;
    audio_optimization?: number;
    metadata: Record<string, any>;
}
