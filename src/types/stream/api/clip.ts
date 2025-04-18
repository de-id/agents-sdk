import { StickyRequest, StreamScript } from '../..';
import { CompatibilityMode } from '../stream';

interface Logo {
    /**
     * https url to an ARGB jpg/png image, a default logo is used otherwise
     * @pattern ((https|s3):\/\/.+) must be a valid https URL
     * @example https://url.to/image.png
     */
    url: string;

    /**
     * position of the logo in pixels from the top left corner (w,h) negative values are subtracted from last pixel
     * @example [0, 500]
     * @minItems 2
     * @maxItems 2
     * @isInt
     */
    position: number[];
}

interface ClipConfig {
    logo?: Logo | boolean;

    /** File format of the animated result
     * @default mp4
     */
    result_format?: 'mp4' | 'gif' | 'mov' | 'webm';
}

export interface CreateClipStreamRequest {
    /**
     * The output resolution sets the maximum height or width of the streamed video.
     * The aspect ratio is preserved from the source video.
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

export interface SendClipStreamPayload extends StickyRequest {
    script: StreamScript;

    /**
     * Advanced configuration options.
     */
    config?: ClipConfig;

    /**
     * The user created the clip.
     */
    created_by?: string;

    /**
     * Advanced presenter configuration options.
     */
    presenter_config?: {
        crop?: {
            /**
             * The type of the crop.
             */
            type: 'rectangle';

            /**
             * A set of numbers between 0 and 1 representing the top, left, right and bottom of the crop.
             * Each number correlates to the distance from the top left corner of the image, relative the the image width.
             * For example, right: 0.75 means that the right side of the crop is 75% of the image width from the left side.
             */
            rectangle: {
                top: number;
                left: number;
                right: number;
                bottom: number;
            };
        };
    };

    /**
     * Background color of the clip result
     */
    background?: {
        /**
         * Background color of the animated result, or false to use transparent background in-case of webm result format.
         * @example "#47ffff"
         * @pattern ^#[a-fA-F0-9]{6}$ must be a valid 6-characters long color css code
         */
        color?: string | false;
    };

    /**
     * Non-sensitive custom data that will be added to the clip response and webhook.
     */
    user_data?: string;

    /**
     * The name of the clip
     */
    name?: string;

    /**
     * The URL of the clip video, if not provided use default destination.
     * @example "https://path.to.directory/"
     */
    result_url?: string;

    /**
     * The URL of the raw clip video, if not provided use default destination.
     * @hidden
     * @example "https://path.to.directory/"
     */
    raw_result_url?: string;

    metadata: Record<string, any>;
}
