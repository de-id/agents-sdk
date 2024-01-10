import { StreamScript } from '../../';

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
}
